import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "./NotificationBell";
import { NotificationsContext, type NotificationsValue } from "../lib/notifications/NotificationsContext";
import type { AppNotification } from "../lib/notifications/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const n = (id: string, category: AppNotification["category"], read = false): AppNotification => ({
  id, category, read, severity: "info", title: `${category} ${id}`, createdAt: Date.now(),
});

function renderBell(items: AppNotification[], overrides: Partial<NotificationsValue> = {}) {
  const value: NotificationsValue = {
    items, unreadCount: items.filter(x => !x.read).length,
    markRead: vi.fn(), markAllRead: vi.fn(), remove: vi.fn(), clear: vi.fn(), ...overrides,
  };
  render(<NotificationsContext.Provider value={value}><NotificationBell /></NotificationsContext.Provider>);
  return value;
}

describe("NotificationBell", () => {
  it("shows the unread count on the badge", () => {
    renderBell([n("1", "fill"), n("2", "alert"), n("3", "feed", true)]);
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument();
  });

  it("hides the badge when everything is read", () => {
    renderBell([n("1", "fill", true)]);
    expect(screen.queryByTestId("unread-badge")).toBeNull();
  });

  it("caps the badge at 99+", () => {
    renderBell(Array.from({ length: 120 }, (_, i) => n(String(i), "fill")));
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("99+");
  });

  it("filters by category", async () => {
    renderBell([n("1", "fill"), n("2", "alert"), n("3", "alert")]);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(dialog).getAllByTestId("notification")).toHaveLength(3);

    await userEvent.click(within(dialog).getByRole("button", { name: "Alerts (2)" }));
    expect(within(dialog).getAllByTestId("notification")).toHaveLength(2);

    await userEvent.click(within(dialog).getByRole("button", { name: "Expiries" }));
    expect(within(dialog).queryAllByTestId("notification")).toHaveLength(0);
    expect(within(dialog).getByText("Nothing in this category.")).toBeInTheDocument();
  });

  it("marks all read for the active filter, and marks one read on open", async () => {
    const v = renderBell([n("1", "fill"), n("2", "alert")]);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Fills/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark all read" }));
    expect(v.markAllRead).toHaveBeenCalledWith("fill");

    await userEvent.click(within(dialog).getByText("fill 1"));
    expect(v.markRead).toHaveBeenCalledWith("1");
  });

  it("closes on Escape", async () => {
    renderBell([n("1", "fill")]);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
