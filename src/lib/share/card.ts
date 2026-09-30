// Builds ShareCard payloads from server-trusted data — a closed position
// fetched from the backend with the sharer's own token, or a strategy
// template repriced at the backend's current spot — and applies the
// sharer's privacy choices before anything is signed.
import type { Position } from "../api/types";
import { combinedPayoffSeries, type PricedLeg } from "../payoff";
import { bs, smileVol } from "../pricing";
import { riskProfile } from "../risk";
import type { StrategyTemplate } from "../strategies";
import { SHARE_PAYLOAD_VERSION, SPARK_POINTS, type ShareCard } from "./payload";

export interface SharePrivacy {
  /** Show only the percentage, never the dollar P&L. */
  hideAbsolutePnl: boolean;
  hideSize: boolean;
  /** Include a truncated wallet ("GABC…WXYZ"). The full address is never shared. */
  showWallet: boolean;
}

export const DEFAULT_PRIVACY: SharePrivacy = { hideAbsolutePnl: true, hideSize: true, showWallet: false };

export function truncateWallet(address: string): string {
  return address.length <= 9 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Payoff-at-expiry sparkline over ±35% of `center` (the same window the
 * payoff diagrams use), y normalized to 0–1. Normalizing here is what
 * keeps premiums and position size out of the signed URL.
 */
export function buildSpark(legs: PricedLeg[], center: number, marker: number | null): ShareCard["spark"] {
  const lo = center * 0.65;
  const hi = center * 1.35;
  const series = combinedPayoffSeries(legs, lo, hi, SPARK_POINTS - 1);
  const max = Math.max(0, ...series.map(p => p.p));
  const min = Math.min(0, ...series.map(p => p.p));
  const span = max - min || 1;
  const norm = (v: number) => Math.round(((v - min) / span) * 1000) / 1000;
  return {
    pts: series.map(p => norm(p.p)),
    zero: norm(0),
    spotX: marker !== null && marker >= lo && marker <= hi ? Math.round(((marker - lo) / (hi - lo)) * 1000) / 1000 : null,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function applyPrivacy(
  base: Omit<ShareCard, "pnlAbs" | "contracts" | "wallet">,
  extras: { pnlAbs?: number; contracts?: number; wallet?: string | null },
  privacy: SharePrivacy
): ShareCard {
  return {
    ...base,
    ...(!privacy.hideAbsolutePnl && extras.pnlAbs !== undefined ? { pnlAbs: Math.round(extras.pnlAbs * 100) / 100 } : {}),
    ...(!privacy.hideSize && extras.contracts !== undefined ? { contracts: extras.contracts } : {}),
    ...(privacy.showWallet && extras.wallet ? { wallet: truncateWallet(extras.wallet) } : {}),
  };
}

/** A realized trade from the ledger. Returns null for positions that haven't closed. */
export function cardFromPosition(p: Position, privacy: SharePrivacy, now: Date): ShareCard | null {
  if ((p.status !== "closed" && p.status !== "rolled") || p.realized_pnl === null) return null;
  const leg: PricedLeg = {
    side: p.option_type,
    action: p.position_type === "short" ? "sell" : "buy",
    strike: p.strike,
    contracts: 1,
    greeks: { premium: p.entry_premium, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0 },
  };
  const basis = p.entry_premium * p.contracts;
  return applyPrivacy(
    {
      v: SHARE_PAYLOAD_VERSION,
      kind: "trade",
      underlying: p.underlying,
      structure: `${p.position_type === "short" ? "Short" : "Long"} ${cap(p.option_type)}`,
      status: p.status,
      expiryDays: p.expiry_days,
      legs: [{ side: leg.side, action: leg.action, strike: p.strike }],
      // Relative to premium paid (long) or collected (short).
      pnlPct: basis > 0 ? Math.round((p.realized_pnl / basis) * 10000) / 100 : null,
      pnlLabel: p.status === "rolled" ? "Realized on roll" : "Realized return",
      spark: buildSpark([leg], p.entry_spot, p.close_spot),
      iat: Math.floor(now.getTime() / 1000),
    },
    { pnlAbs: p.realized_pnl, contracts: p.contracts, wallet: p.wallet_address },
    privacy
  );
}

/**
 * A strategy preview, priced the same way the Strategies tab prices it
 * (bs + smile at the underlying's vol). The "P&L %" of a hypothetical
 * trade is its max return on risk; null when either side is unbounded.
 */
export function cardFromStrategy(
  template: StrategyTemplate,
  market: { underlying: string; spot: number; vol: number },
  opts: { expiryDays: number; contracts: number },
  privacy: SharePrivacy,
  now: Date
): ShareCard {
  const t = opts.expiryDays / 365;
  const legs: PricedLeg[] = template.legs.map(l => {
    const strike = Math.round(market.spot * l.strikeOffset * 10000) / 10000;
    return {
      side: l.side, action: l.action, strike, contracts: 1,
      greeks: bs(market.spot, strike, smileVol(market.vol, l.strikeOffset), t, l.side === "call"),
    };
  });
  const profile = riskProfile(legs, market.spot);
  const bounded = !profile.maxProfitUnlimited && !profile.maxLossUnlimited && profile.maxLoss < 0;
  return applyPrivacy(
    {
      v: SHARE_PAYLOAD_VERSION,
      kind: "strategy",
      underlying: market.underlying,
      structure: template.name,
      status: "preview",
      expiryDays: opts.expiryDays,
      legs: legs.map(l => ({ side: l.side, action: l.action, strike: l.strike })),
      pnlPct: bounded ? Math.round((profile.maxProfit / Math.abs(profile.maxLoss)) * 10000) / 100 : null,
      pnlLabel: bounded ? "Max return on risk" : profile.maxProfitUnlimited ? "Unlimited upside" : "Unbounded risk",
      spark: buildSpark(legs, market.spot, market.spot),
      iat: Math.floor(now.getTime() / 1000),
    },
    // A preview has no realized P&L; size is shown only if the sharer opts in.
    { contracts: opts.contracts },
    privacy
  );
}
