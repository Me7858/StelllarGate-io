import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { mockBackend, samplePosition, skipOnboarding, goto } from "./mockBackend";

async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}

test.beforeEach(async ({ page }) => skipOnboarding(page));

test("full trade flow on a phone: side toggle, bottom-sheet ticket, confirm", async ({ page }) => {
  const backend = await mockBackend(page, { signedIn: ["paper"] });
  await goto(page, "/options");
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("chain-mobile")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // One side at a time.
  await page.getByRole("button", { name: "PUTS" }).click();
  await expect(page.getByRole("button", { name: "PUTS" })).toHaveAttribute("aria-pressed", "true");
  const ask = page.getByTestId("chain-mobile").getByRole("button", { name: /^Buy XLM .* put at ask/ }).nth(10);
  const box = await ask.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await ask.click();

  const sheet = page.getByTestId("ticket-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("order-ticket")).toContainText("XLM Put");
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-ticket.png` });

  await sheet.getByRole("spinbutton", { name: "Contracts" }).fill("3");
  await sheet.getByTestId("ticket-review").click();
  const dialog = page.getByRole("dialog", { name: /Buy XLM PUT/ });
  await expect(dialog.getByTestId("mode-stamp")).toContainText("Paper Trading");
  await expect(dialog.getByTestId("trade-summary")).toContainText("You're buying 3 XLM");
  await dialog.getByRole("button", { name: "Confirm Buy" }).click();

  await expect.poll(() => backend.opened.length).toBe(1);
  expect(backend.opened[0]).toMatchObject({ underlying: "XLM", option_type: "put", position_type: "long", contracts: 3 });
  await expect(page.getByRole("tab", { name: /positions/i })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("position-card").first()).toBeVisible();
});

test("the ticket sheet can be dismissed by dragging it down", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await page.getByTestId("chain-mobile").getByRole("button", { name: /^Buy XLM .* call at ask/ }).first().click();
  const handle = page.getByRole("button", { name: "Close Order ticket" });
  await expect(handle).toBeVisible();
  const b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 500, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("ticket-sheet")).toBeHidden();
});

test("portfolio and history become cards with no horizontal scroll", async ({ page }) => {
  await mockBackend(page, { signedIn: ["paper"], positions: [samplePosition] });
  await goto(page, "/portfolio");
  const card = page.getByTestId("portfolio-card").first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { expanded: false }).click();
  await expect(card.getByRole("button", { name: "Sell to close" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-portfolio.png`, fullPage: true });

  await goto(page, "/history");
  await expectNoHorizontalScroll(page);
  await goto(page, "/");
  await expectNoHorizontalScroll(page);
});

test("swipe changes terminal tabs", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  const panel = page.locator("#terminal-panel");
  await expect(page.getByRole("tab", { name: "chain" })).toHaveAttribute("aria-selected", "true");
  await panel.evaluate(el => {
    const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t(300)], changedTouches: [t(300)] }));
    el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [t(120)] }));
  });
  await expect(page.getByRole("tab", { name: "positions" })).toHaveAttribute("aria-selected", "true");
});

test("visual: phone chain", async ({ page }, testInfo) => {
  // Baselines are per device/platform and committed under e2e/*-snapshots.
  // Generate a missing one with `npx playwright test --project=<device> --update-snapshots`.
  test.skip(!existsSync(testInfo.snapshotPath("options-chain.png")) && !testInfo.config.updateSnapshots.startsWith("all"),
    "no committed baseline for this device yet");
  await mockBackend(page);
  await goto(page, "/options");
  await expect(page.getByTestId("chain-mobile")).toBeVisible();
  await expect(page).toHaveScreenshot("options-chain.png", { mask: [page.locator(".num"), page.locator("svg")] });
});
