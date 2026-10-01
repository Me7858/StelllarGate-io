// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProbabilityStats } from "./ProbabilityStats";
import { MultiLegPayoffDiagram } from "./MultiLegPayoffDiagram";
import type { PricedLeg } from "../lib/payoff";

const call: PricedLeg = {
  side: "call", action: "buy", strike: 100, contracts: 1,
  greeks: { premium: 5, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0.6 },
};

describe("ProbabilityStats", () => {
  it("shows PoP, P(ITM), EV and σ ranges for a single leg", () => {
    render(<ProbabilityStats legs={[call]} spot={100} vol={0.6} t={30 / 365} />);
    for (const label of ["PROB. OF PROFIT", "PROB. ITM", "EXPECTED VALUE", "1σ RANGE", "2σ RANGE"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("omits P(ITM) for multi-leg structures", () => {
    const put: PricedLeg = { ...call, side: "put" };
    render(<ProbabilityStats legs={[call, put]} spot={100} vol={0.6} t={30 / 365} />);
    expect(screen.queryByText("PROB. ITM")).not.toBeInTheDocument();
  });

  it("documents its assumptions in an accessible tooltip", async () => {
    render(<ProbabilityStats legs={[call]} spot={100} vol={0.6} t={30 / 365} note="Extra note" />);
    const btn = screen.getByRole("button", { name: /assumptions/i });
    await userEvent.click(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent(/risk-neutral/i);
    expect(tip).toHaveTextContent("Extra note");
  });

  it("switches between flat and smile vol models", async () => {
    render(<ProbabilityStats legs={[{ ...call, strike: 80 }]} spot={100} vol={0.6} t={30 / 365} />);
    const itm = () => screen.getByText("PROB. ITM").nextSibling?.textContent;
    const flat = itm();
    await userEvent.click(screen.getByRole("button", { name: "Smile" }));
    expect(screen.getByRole("button", { name: "Smile" })).toHaveAttribute("aria-pressed", "true");
    expect(itm()).not.toBe(flat);
  });
});

describe("payoff density overlay", () => {
  it("is off by default and toggles on", async () => {
    render(<MultiLegPayoffDiagram legs={[call]} spot={100} distribution={{ vol: 0.6, t: 30 / 365 }} />);
    expect(screen.queryByTestId("density-overlay")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /prob/i }));
    expect(screen.getByTestId("density-overlay")).toBeInTheDocument();
  });

  it("has no toggle without a distribution", () => {
    render(<MultiLegPayoffDiagram legs={[call]} spot={100} />);
    expect(screen.queryByRole("button", { name: /prob/i })).not.toBeInTheDocument();
  });
});
