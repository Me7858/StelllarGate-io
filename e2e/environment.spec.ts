import { expect, test } from "@playwright/test";
import { mockBackend, skipOnboarding, goto } from "./mockBackend";

test.beforeEach(async ({ page }) => skipOnboarding(page));

test("paper is the default mode: banner, title prefix and favicon", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await expect(page.locator("html")).toHaveAttribute("data-env", "paper");
  await expect(page.getByTestId("env-banner")).toContainText("Paper Trading");
  await expect(page).toHaveTitle(/^\[PAPER\] /);
  const icon = await page.locator('link[rel~="icon"]').first().getAttribute("href");
  expect(icon).toContain("data:image/svg+xml");
  await page.screenshot({ path: "test-results/screens/mode-paper.png" });
});

test("switching to mainnet needs explicit confirmation", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await page.getByTestId("env-selector").selectOption("mainnet");

  const dialog = page.getByRole("dialog", { name: /switch to soroban mainnet/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("mode-stamp")).toContainText("Paper Trading");
  // Not switched yet, and can't confirm without the acknowledgement.
  await expect(page.getByTestId("env-selector")).toHaveValue("paper");
  const confirm = dialog.getByRole("button", { name: "Switch to Mainnet" });
  await expect(confirm).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-env", "paper");

  // Cancel keeps paper.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-env", "paper");

  // Acknowledge + confirm switches.
  await page.getByTestId("env-selector").selectOption("mainnet");
  await page.getByTestId("mainnet-ack").check();
  await page.getByRole("button", { name: "Switch to Mainnet" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-env", "mainnet");
  await expect(page.getByTestId("env-banner")).toContainText("Soroban Mainnet");
  await expect(page).toHaveTitle(/^\[MAINNET\] /);
  await page.screenshot({ path: "test-results/screens/mode-mainnet.png" });
});

test("testnet switches without confirmation and is amber", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await page.getByTestId("env-selector").selectOption("testnet");
  await expect(page.locator("html")).toHaveAttribute("data-env", "testnet");
  await expect(page).toHaveTitle(/^\[TESTNET\] /);
  const bg = await page.getByTestId("env-banner").evaluate(el => getComputedStyle(el).backgroundImage);
  expect(bg).toContain("224, 165, 38");
  await page.screenshot({ path: "test-results/screens/mode-testnet.png" });
});

test("the mode persists across reloads", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await page.getByTestId("env-selector").selectOption("testnet");
  await expect(page.locator("html")).toHaveAttribute("data-env", "testnet");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-env", "testnet");
});

test("a ?mode=mainnet deep link never switches automatically", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options?mode=mainnet");
  await expect(page.getByTestId("mainnet-link-prompt")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-env", "paper");
  await page.getByRole("button", { name: "Review switch" }).click();
  await expect(page.getByTestId("mainnet-confirm")).toBeVisible();
});

test("a ?mode=testnet deep link switches directly", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options?mode=testnet");
  await expect(page.locator("html")).toHaveAttribute("data-env", "testnet");
});

test("sessions and requests never cross modes", async ({ page }) => {
  const backend = await mockBackend(page, { signedIn: ["paper"] });
  await goto(page, "/portfolio");
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "ready");

  await page.getByTestId("env-selector").selectOption("testnet");
  await expect(page.locator("html")).toHaveAttribute("data-env", "testnet");
  // No paper session on testnet: signed-out state, not paper's data.
  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "signed-out");

  // Back to paper: the paper session is still there.
  await page.getByTestId("env-selector").selectOption("paper");
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "ready");

  for (const r of backend.requests) {
    if (r.auth) expect(r.auth).toBe(`Bearer ${r.mode}-token`);
  }
  expect(backend.requests.some(r => r.mode === "testnet" && r.auth === "Bearer paper-token")).toBe(false);
});
