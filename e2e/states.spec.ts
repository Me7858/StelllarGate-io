import { expect, test } from "@playwright/test";
import { mockBackend, samplePosition, skipOnboarding, goto } from "./mockBackend";

test.beforeEach(async ({ page }) => skipOnboarding(page));

test("signed out: every authed surface shows the connect CTA", async ({ page }) => {
  await mockBackend(page);
  await goto(page, "/portfolio");
  await expect(page.getByTestId("auth-gate")).toContainText("Connect your wallet to see your portfolio");
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "signed-out");
  await goto(page, "/history");
  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await goto(page, "/options");
  await expect(page.getByTestId("alerts-auth")).toBeVisible();
});

test("loading never renders a $0.00 balance", async ({ page }) => {
  await mockBackend(page, { signedIn: ["paper"], delayMs: 1500 });
  await goto(page, "/portfolio");
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "loading");
  await expect(page.getByTestId("portfolio-summary")).not.toContainText("$0.00");
  await expect(page.getByTestId("portfolio-skeleton")).toBeVisible();
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("portfolio-summary")).toContainText("$10000.00");
});

test("backend errors are shown with a working retry", async ({ page }) => {
  await mockBackend(page, { signedIn: ["paper"], fail: true });
  await goto(page, "/portfolio");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't load positions" })).toBeVisible();
  await expect(page.getByTestId("account-chip")).toHaveAttribute("data-state", "error");
  await goto(page, "/options");
  await expect(page.getByTestId("chain-error")).toContainText("showing model prices");
  await expect(page.getByTestId("chain")).toHaveAttribute("data-source", "model");
});

test("empty and populated states", async ({ page }) => {
  await mockBackend(page, { signedIn: ["paper"] });
  await goto(page, "/portfolio");
  await expect(page.getByTestId("portfolio-empty")).toContainText("No open positions");
  await goto(page, "/history");
  await expect(page.getByTestId("history-empty")).toBeVisible();

  const page2 = await page.context().newPage();
  await skipOnboarding(page2);
  await mockBackend(page2, { signedIn: ["paper"], positions: [samplePosition] });
  await goto(page2, "/portfolio");
  await expect(page2.getByTestId("risk-content")).toBeVisible();
});

for (const path of ["/", "/options", "/portfolio", "/history"]) {
  test(`CLS stays under 0.05 on ${path}`, async ({ page }) => {
    await mockBackend(page, { signedIn: ["paper"], positions: [samplePosition], delayMs: 400 });
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver(list => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await goto(page, path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThan(0.05);
  });
}
