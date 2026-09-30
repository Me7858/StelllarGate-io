// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "../lib/api/types";

const fixture = JSON.parse(readFileSync(join(__dirname, "../lib/__fixtures__/ledger.json"), "utf8")) as {
  history: Position[];
  open: Position[];
};

vi.mock("../lib/api/history", () => ({ getFullHistory: vi.fn() }));
vi.mock("../lib/csv", async (orig) => ({ ...(await orig<typeof import("../lib/csv")>()), downloadCsv: vi.fn(), downloadBlob: vi.fn() }));

import { getFullHistory } from "../lib/api/history";
import { downloadCsv } from "../lib/csv";
import { StatementsPanel } from "./StatementsPanel";

const now = new Date("2026-03-25T12:00:00Z");

beforeEach(() => {
  vi.mocked(getFullHistory).mockResolvedValue(fixture.history);
  vi.mocked(downloadCsv).mockClear();
});

describe("StatementsPanel", () => {
  it("defaults to the current quarter and summarizes it", async () => {
    render(<StatementsPanel token="t" walletAddress="G" openPositions={fixture.open} now={now} />);
    const summary = await screen.findByTestId("statement-summary");
    expect(screen.getByText(/Q1 2026 · 2026-01-01 to 2026-03-31/)).toBeInTheDocument();
    expect(summary).toHaveTextContent("5 (2 rolled)");
    expect(summary).toHaveTextContent("$332.58"); // 2.1 − 299.875 + 599.95 + 29.8 + 0.6
  });

  it("filters by underlying", async () => {
    render(<StatementsPanel token="t" walletAddress="G" openPositions={fixture.open} now={now} />);
    await screen.findByTestId("statement-summary");
    await userEvent.selectOptions(screen.getByLabelText("Underlying"), "BTC");
    expect(screen.getByTestId("statement-summary")).toHaveTextContent("2 (1 rolled)");
  });

  it("switches to a month period", async () => {
    render(<StatementsPanel token="t" walletAddress="G" openPositions={fixture.open} now={now} />);
    await screen.findByTestId("statement-summary");
    await userEvent.click(screen.getByRole("button", { name: "month" }));
    expect(screen.getByText(/Mar 2026/)).toBeInTheDocument();
    expect(screen.getByTestId("statement-summary")).toHaveTextContent("3 (1 rolled)");
  });

  it("rejects a reversed custom range", async () => {
    render(<StatementsPanel token="t" walletAddress="G" openPositions={fixture.open} now={now} />);
    await screen.findByTestId("statement-summary");
    await userEvent.click(screen.getByRole("button", { name: "custom" }));
    const from = screen.getByLabelText("From");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-12-01");
    expect(screen.getByRole("alert")).toHaveTextContent(/valid date range/);
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeDisabled();
  });

  it("downloads the CSV with a period-named file", async () => {
    render(<StatementsPanel token="t" walletAddress="G" openPositions={fixture.open} now={now} />);
    await screen.findByTestId("statement-summary");
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    const [name, parts] = vi.mocked(downloadCsv).mock.calls[0];
    expect(name).toBe("zenith-statement-2026-01-01_2026-03-31.csv");
    expect((parts as string[]).join("")).toContain("Realized P&L");
  });

  it("shows the disclaimer", async () => {
    render(<StatementsPanel token="t" walletAddress="G" openPositions={[]} now={now} />);
    expect(screen.getByText(/not tax advice/i)).toBeInTheDocument();
  });

  it("reports a ledger load failure", async () => {
    vi.mocked(getFullHistory).mockRejectedValueOnce(new Error("down"));
    render(<StatementsPanel token="t" walletAddress="G" openPositions={[]} now={now} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't load/);
  });
});
