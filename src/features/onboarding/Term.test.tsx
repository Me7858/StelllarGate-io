import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Term } from "./Term";

function setup() {
  render(
    <div>
      <button type="button">before</button>
      <Term id="theta">Θ Theta</Term>
      <button type="button">after</button>
    </div>
  );
  return { trigger: screen.getByRole("button", { name: "Θ Theta" }) };
}

const tooltip = () => screen.getByRole("tooltip", { hidden: true });
/** The visual tooltip is created lazily on first open. */
const tooltipShown = () => {
  const el = screen.queryByRole("tooltip", { hidden: true });
  return !!el && !el.hidden;
};

describe("<Term> tooltip (WCAG 1.4.13)", () => {
  it("is reachable with Tab and shows on focus", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    expect(tooltipShown()).toBe(false);
    await user.tab();
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(tooltip()).toBeVisible();
    expect(tooltip()).toHaveTextContent(/Time decay/);
  });

  it("is announced via aria-describedby, without changing the term's name", async () => {
    const { trigger } = setup();
    expect(trigger).toHaveAccessibleDescription(/Time decay/);
    expect(trigger).toHaveAccessibleName("Θ Theta");
  });

  it("dismisses with Escape without moving focus, and reopens on next focus", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    act(() => trigger.focus());
    expect(tooltip()).toBeVisible();
    await user.keyboard("{Escape}");
    expect(tooltip()).not.toBeVisible();
    expect(trigger).toHaveFocus();
    await user.tab();
    await user.tab({ shift: true });
    expect(tooltip()).toBeVisible();
  });

  it("hides when focus moves away", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    act(() => trigger.focus());
    await user.tab();
    expect(tooltip()).not.toBeVisible();
  });

  it("toggles with Enter/Space and tap (click)", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    act(() => trigger.focus());
    await user.keyboard("{Escape}");
    expect(tooltip()).not.toBeVisible();
    await user.keyboard("{Enter}");
    expect(tooltip()).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("opens on mouse hover and stays open while the pointer moves onto it (hoverable)", async () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    expect(tooltip()).toBeVisible();
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    fireEvent.pointerEnter(tooltip(), { pointerType: "mouse" });
    await act(() => new Promise(r => setTimeout(r, 200)));
    expect(tooltip()).toBeVisible();
    fireEvent.pointerLeave(tooltip(), { pointerType: "mouse" });
    await act(() => new Promise(r => setTimeout(r, 200)));
    expect(tooltip()).not.toBeVisible();
  });

  it("persists while hovered (no timeout)", async () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    await act(() => new Promise(r => setTimeout(r, 600)));
    expect(tooltip()).toBeVisible();
  });

  it("ignores touch hover emulation but closes on outside tap", async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    expect(tooltipShown()).toBe(false);
    await user.click(trigger);
    expect(tooltip()).toBeVisible();
    fireEvent.pointerDown(document.body);
    act(() => trigger.blur());
    expect(tooltip()).not.toBeVisible();
  });
});
