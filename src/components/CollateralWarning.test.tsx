// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account, Position } from "../lib/api/types";
import { DEFAULT_THRESHOLDS } from "../lib/collateral";
import { useCollateralSettings } from "../lib/store/collateralSettings";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("../lib/notify", () => ({
  sendNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

import { sendNotification } from "../lib/notify";
import { CollateralWarningBadge, resetCollateralNotificationState, useCollateralNotifications } from "./CollateralWarning";
import { CollateralDashboard, UtilizationGauge } from "./CollateralDashboard";

const account = (balance: number, locked: number): Account => ({
  wallet_address: "GTEST", balance, collateral_locked: locked, created_at: "2026-01-01T00:00:00Z",
});

const shortPut = (id: string, collateral: number): Position => ({
  id, wallet_address: "GTEST", underlying: "BTC", strike: 60000, expiry_days: 30, option_type: "put",
  position_type: "short", contracts: 1, entry_premium: 500, entry_spot: 65000, collateral, status: "open",
  close_premium: null, close_spot: null, realized_pnl: null, opened_at: "2026-09-01T00:00:00Z", closed_at: null, strategy_id: null,
});

beforeEach(() => {
  vi.mocked(sendNotification).mockClear();
  resetCollateralNotificationState();
  useCollateralSettings.setState({ ...DEFAULT_THRESHOLDS, notify: true });
});

describe("CollateralWarningBadge", () => {
  it("is hidden below the warning threshold", () => {
    render(<CollateralWarningBadge utilization={0.79} thresholds={DEFAULT_THRESHOLDS} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a warning at the threshold, with a text label (not color alone)", () => {
    render(<CollateralWarningBadge utilization={0.8} thresholds={DEFAULT_THRESHOLDS} />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("High collateral use");
    expect(badge).toHaveTextContent("80%");
    expect(badge).toHaveAttribute("href", "/portfolio#collateral");
  });

  it("escalates to critical", () => {
    render(<CollateralWarningBadge utilization={0.97} thresholds={DEFAULT_THRESHOLDS} />);
    expect(screen.getByRole("status")).toHaveTextContent("Critical collateral use");
  });

  it("respects custom thresholds", () => {
    render(<CollateralWarningBadge utilization={0.55} thresholds={{ warning: 0.5, critical: 0.9 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("High");
  });
});

describe("useCollateralNotifications", () => {
  const opts = { enabled: true, active: true };

  it("notifies once per escalation and re-arms after dropping back", () => {
    const { rerender } = renderHook(({ u }) => useCollateralNotifications(u, DEFAULT_THRESHOLDS, opts), { initialProps: { u: 0.5 } });
    expect(sendNotification).not.toHaveBeenCalled();

    rerender({ u: 0.85 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    rerender({ u: 0.86 });
    expect(sendNotification).toHaveBeenCalledTimes(1);

    rerender({ u: 0.96 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1][0]).toMatch(/critical/);

    rerender({ u: 0.5 });
    rerender({ u: 0.9 });
    expect(sendNotification).toHaveBeenCalledTimes(3);
  });

  it("does not re-notify when the header remounts on navigation", () => {
    const first = renderHook(() => useCollateralNotifications(0.9, DEFAULT_THRESHOLDS, opts));
    first.unmount();
    renderHook(() => useCollateralNotifications(0.9, DEFAULT_THRESHOLDS, opts));
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when disabled or before the account has loaded", () => {
    renderHook(() => useCollateralNotifications(0.99, DEFAULT_THRESHOLDS, { enabled: true, active: false }));
    renderHook(() => useCollateralNotifications(0.99, DEFAULT_THRESHOLDS, { enabled: false, active: true }));
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("UtilizationGauge", () => {
  it.each([
    [0.3, "ok", "Healthy"],
    [0.82, "warning", "High"],
    [0.99, "critical", "Critical"],
  ])("utilization %s renders as %s", (u, level, text) => {
    render(<UtilizationGauge utilization={u} thresholds={DEFAULT_THRESHOLDS} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("data-level", level);
    expect(meter).toHaveAttribute("aria-valuenow", String(Math.round(u * 100)));
    expect(meter).toHaveTextContent(text);
  });
});

describe("CollateralDashboard", () => {
  const items = [
    { position: shortPut("a", 66000), spot: 65000, pnl: 100, currentPremium: 400 },
    { position: shortPut("b", 13200), spot: 65000, pnl: -50, currentPremium: 550 },
  ];
  const props = { items, spots: { BTC: 65000 }, vols: { BTC: 0.65 }, now: new Date("2026-09-11T00:00:00Z") };

  it("summarizes balance, locked, free capital and reconciles", () => {
    render(<CollateralDashboard account={account(100_000, 79_200)} {...props} />);
    expect(screen.getByText("$20,800.00")).toBeInTheDocument();
    expect(screen.getByText(/Reconciled/)).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("data-level", "ok");
  });

  it("flags a reconciliation mismatch", () => {
    render(<CollateralDashboard account={account(100_000, 90_000)} {...props} />);
    expect(screen.getAllByRole("alert").some(a => /reconciliation mismatch/i.test(a.textContent ?? ""))).toBe(true);
  });

  it("goes to warning when the user lowers the threshold", async () => {
    render(<CollateralDashboard account={account(100_000, 79_200)} {...props} />);
    const input = screen.getByLabelText("Warn at threshold percent");
    await userEvent.clear(input);
    await userEvent.type(input, "70");
    expect(screen.getByRole("meter")).toHaveAttribute("data-level", "warning");
  });

  it("sorts the per-position table from the column header", async () => {
    render(<CollateralDashboard account={account(100_000, 79_200)} {...props} />);
    const firstCell = () => screen.getAllByRole("row")[1].textContent;
    expect(firstCell()).toContain("66,000.00");
    await userEvent.click(screen.getByRole("button", { name: /^Collateral/ }));
    expect(firstCell()).toContain("13,200.00");
    expect(screen.getByRole("columnheader", { name: /^Collateral/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("warns in the what-if panel when a write would breach the threshold", async () => {
    render(<CollateralDashboard account={account(100_000, 79_200)} {...props} />);
    await userEvent.selectOptions(screen.getByLabelText("Underlying"), "BTC");
    // One 100%-strike BTC put locks 110% × 65,000 = 71,500 → far past critical.
    expect(screen.getByTestId("what-if-result")).toHaveTextContent(/Collateral consumed/);
    expect(screen.getByTestId("what-if-result")).toHaveTextContent(/Insufficient buying power/);
  });
});
