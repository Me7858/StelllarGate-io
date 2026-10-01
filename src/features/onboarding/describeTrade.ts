import { format, getMessages, plural, type Messages } from "./i18n";

// Plain-language trade summaries for confirm dialogs. Pure: same legs in,
// same words out, no pricing calls or store reads — so it can be unit
// tested against every strategy template.

export interface TradeLeg {
  side: "call" | "put";
  action: "buy" | "sell";
  strike: number;
  contracts: number;
  /** Per-contract premium. */
  premium: number;
}

export interface TradeContext {
  underlying: string;
  expiryDays: number;
  /** Collateral the trade locks, when known (writes only). */
  collateral?: number;
}

export interface TradeDescription {
  /** The full summary, ready to render. */
  text: string;
  sentences: string[];
  /** Positive = paid to open, negative = collected. */
  netPremium: number;
  /** null = unlimited. Expressed as a positive amount. */
  maxLoss: number | null;
  /** null = unlimited. */
  maxProfit: number | null;
  breakevens: number[];
  /** Price ranges (at expiry) where the position loses money. `high: null` = unbounded. */
  lossRegions: { low: number; high: number | null }[];
}

const EPS = 1e-9;

/** P&L of all legs at expiry if the underlying settles at `s`. */
export function payoffAt(legs: TradeLeg[], s: number): number {
  return legs.reduce((sum, leg) => {
    const intrinsic = leg.side === "call" ? Math.max(0, s - leg.strike) : Math.max(0, leg.strike - s);
    const perContract = leg.action === "buy" ? intrinsic - leg.premium : leg.premium - intrinsic;
    return sum + perContract * leg.contracts;
  }, 0);
}

/**
 * Exact risk profile. Payoff at expiry is piecewise linear with kinks only
 * at strikes, so evaluating at 0, every strike, and the slope past the
 * highest strike gives exact max loss/profit and breakevens — no sampling.
 */
export function analyzePayoff(legs: TradeLeg[]) {
  const strikes = Array.from(new Set(legs.map(l => l.strike))).sort((a, b) => a - b);
  const xs = [0, ...strikes.filter(k => k > 0)];
  const ys = xs.map(x => payoffAt(legs, x));
  // Beyond the top strike only calls have slope: +contracts if long, −contracts if short.
  const tailSlope = legs.reduce((m, l) => (l.side === "call" ? m + (l.action === "buy" ? 1 : -1) * l.contracts : m), 0);

  const breakevens: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const [y0, y1] = [ys[i - 1], ys[i]];
    if ((y0 < -EPS && y1 > EPS) || (y0 > EPS && y1 < -EPS)) {
      breakevens.push(xs[i - 1] + ((-y0) / (y1 - y0)) * (xs[i] - xs[i - 1]));
    } else if (Math.abs(y1) <= EPS && i < xs.length - 1) {
      const y2 = ys[i + 1];
      if ((y0 < -EPS && y2 > EPS) || (y0 > EPS && y2 < -EPS)) breakevens.push(xs[i]);
    }
  }
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];
  if (Math.abs(tailSlope) > EPS && ((lastY < -EPS && tailSlope > 0) || (lastY > EPS && tailSlope < 0))) {
    breakevens.push(lastX - lastY / tailSlope);
  }

  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const maxLoss = tailSlope < -EPS ? null : Math.max(0, -minY);
  const maxProfit = tailSlope > EPS ? null : Math.max(0, maxY);

  // Loss regions: walk the segments between 0, the breakevens, and ∞, and
  // test the sign at each segment's midpoint.
  const bounds = [0, ...breakevens];
  const lossRegions: { low: number; high: number | null }[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const low = bounds[i];
    const high = i + 1 < bounds.length ? bounds[i + 1] : null;
    const probe = high === null ? Math.max(low, lastX) * 1.5 + 1 : (low + high) / 2;
    if (payoffAt(legs, probe) < -EPS) lossRegions.push({ low, high });
  }

  return { breakevens, maxLoss, maxProfit, lossRegions, tailSlope };
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return `$${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtPrice(n: number): string {
  return n >= 1000
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toFixed(4)}`;
}

/** 70000 → "70k", 67420.5 → "67,420.50", 0.1182 → "0.1182". */
export function fmtStrike(k: number): string {
  if (k >= 1000 && k % 1000 === 0) return `${k / 1000}k`;
  if (k >= 1000) return k.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return k.toFixed(4);
}

function fmtContracts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function describeTrade(legs: TradeLeg[], ctx: TradeContext, messages: Messages = getMessages()): TradeDescription {
  const t = messages.trade;
  const locale = messages.locale;
  const days = plural(t, locale, "days", ctx.expiryDays);
  const sentences: string[] = [];

  if (legs.length === 0) {
    return { text: "", sentences, netPremium: 0, maxLoss: 0, maxProfit: 0, breakevens: [], lossRegions: [] };
  }

  // 1. What you're doing.
  if (legs.length === 1) {
    const [leg] = legs;
    sentences.push(format(t["what.single"], {
      action: t[`action.${leg.action}`],
      contracts: fmtContracts(leg.contracts),
      underlying: ctx.underlying,
      strike: fmtStrike(leg.strike),
      optionType: plural(t, locale, `optionType.${leg.side}`, leg.contracts),
      days,
    }));
  } else {
    const legList = legs.map(leg => format(t["what.leg"], {
      action: t[`legAction.${leg.action}`],
      contracts: fmtContracts(leg.contracts),
      strike: fmtStrike(leg.strike),
      optionType: plural(t, locale, `optionType.${leg.side}`, leg.contracts),
    })).join(t["what.legJoin"]);
    sentences.push(format(t["what.multi"], { count: legs.length, underlying: ctx.underlying, days, legs: legList }));
  }

  // 2. Cash now.
  const netPremium = legs.reduce((s, l) => s + (l.action === "buy" ? l.premium : -l.premium) * l.contracts, 0);
  if (Math.abs(netPremium) < EPS) sentences.push(t["cash.zero"]);
  else sentences.push(format(netPremium > 0 ? t["cash.pay"] : t["cash.collect"], { amount: fmtMoney(netPremium) }));
  if (ctx.collateral && ctx.collateral > 0) sentences.push(format(t.collateral, { amount: fmtMoney(ctx.collateral) }));

  // 3. Where you lose money, and how much.
  const { breakevens, maxLoss, maxProfit, lossRegions } = analyzePayoff(legs);
  if (lossRegions.length === 0) {
    sentences.push(t["loss.none"]);
  } else {
    const regions = lossRegions.map(r => {
      if (r.high === null) return format(t["region.above"], { price: fmtPrice(r.low) });
      if (r.low <= EPS) return format(t["region.below"], { price: fmtPrice(r.high) });
      return format(t["region.between"], { low: fmtPrice(r.low), high: fmtPrice(r.high) });
    }).join(t["region.join"]);
    const where = format(t["loss.where"], { underlying: ctx.underlying, regions });
    sentences.push(maxLoss === null ? `${where}${t["loss.unlimited"]}` : `${where}${format(t["loss.max"], { amount: fmtMoney(maxLoss) })}`);
  }

  // 4. Upside.
  if (maxProfit === null) sentences.push(format(t["profit.unlimited"], { underlying: ctx.underlying }));
  else if (maxProfit <= EPS) sentences.push(t["profit.none"]);
  else sentences.push(format(t["profit.max"], { amount: fmtMoney(maxProfit) }));

  return { text: sentences.join(" "), sentences, netPremium, maxLoss, maxProfit, breakevens, lossRegions };
}
