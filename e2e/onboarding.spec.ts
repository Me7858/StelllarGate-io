import { expect, test } from "@playwright/test";
import { mockBackend, goto } from "./mockBackend";

test("first-run tour: chain → ticket → confirm → portfolio, resumable, with persisted state", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await expect(page.getByTestId("tour-welcome")).toBeVisible();
  await page.getByTestId("tour-start").click();

  const card = page.getByTestId("tour-card");
  await expect(card).toHaveAttribute("data-step", "chain");
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();
  await page.getByTestId("tour-next").click();

  // Ticket step: anchor missing until a price is clicked — card explains how.
  await expect(card).toHaveAttribute("data-step", "ticket");
  await expect(card).toContainText("Click any Ask or Bid price");
  await page.getByRole("button", { name: /^Buy XLM .* call at ask/ }).first().click();
  await expect(page.getByTestId("order-ticket")).toBeVisible();
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();

  // Reload mid-tour: resumes on the same step.
  await page.reload();
  await expect(page.getByTestId("tour-card")).toHaveAttribute("data-step", "ticket");

  // Escape pauses; the ? menu resumes.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour-card")).toBeHidden();
  await page.getByTestId("help-menu").click();
  await page.getByRole("menuitem", { name: "Resume tour" }).click();
  await expect(page.getByTestId("tour-card")).toHaveAttribute("data-step", "ticket");

  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-card")).toHaveAttribute("data-step", "confirm");
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-card")).toHaveAttribute("data-step", "portfolio");
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour-card")).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("tour-welcome")).toBeHidden();
});

test("skipping the tour sticks", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await page.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  await expect(page.getByTestId("tour-welcome")).toBeHidden();
});

test("practice mode: plain-language summary, nothing sent", async ({ page }) => {
  const backend = await mockBackend(page);
  await goto(page, "/options");
  await page.getByText("Also turn on practice mode").click();
  await page.getByTestId("tour-start").click();
  await page.getByRole("button", { name: "Skip tour" }).click();

  await page.getByRole("button", { name: /^Write XLM .* call at bid/ }).nth(12).click();
  await page.getByTestId("ticket-review").click();
  const dialog = page.getByRole("dialog", { name: /Practice: Write XLM CALL/ });
  await expect(dialog.getByTestId("mode-stamp")).toContainText("PRACTICE");
  await expect(dialog.getByTestId("trade-summary")).toContainText("You're selling 1 XLM");
  await expect(dialog.getByTestId("trade-summary")).toContainText("losses are unlimited above that");
  await page.screenshot({ path: "test-results/screens/confirm-summary.png" });
  await dialog.getByRole("button", { name: "Simulate trade" }).click();
  await expect(page.getByTestId("practice-result")).toContainText("Nothing was sent");
  expect(backend.opened).toHaveLength(0);
});

test("glossary tooltips work from the keyboard", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/options");
  await page.getByRole("button", { name: "Not now" }).click();
  await page.getByRole("button", { name: /^Buy XLM .* call at ask/ }).first().click();
  const theta = page.getByTestId("order-ticket").getByRole("button", { name: "Θ Theta" });
  await theta.focus();
  const tip = page.getByRole("tooltip").filter({ hasText: "Time decay" });
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await expect(theta).toBeFocused();
});
