import type { FinderInput, FinderMarket } from "./engine";

/** $100 underlying at 60% vol, strikes every $2.50 from 50 to 150, 6 expiries. */
export const FIXTURE_MARKET: FinderMarket = {
  spot: 100,
  vol: 0.6,
  strikes: Array.from({ length: 41 }, (_, i) => 50 + i * 2.5),
  expiries: [
    { label: "7D", days: 7 }, { label: "14D", days: 14 }, { label: "30D", days: 30 },
    { label: "60D", days: 60 }, { label: "90D", days: 90 }, { label: "180D", days: 180 },
  ],
};

export const BULLISH_INPUT: FinderInput = {
  outlook: "bullish", targetPrice: 115, targetDays: 30, maxLoss: 20, budget: 250, allowUndefinedRisk: false,
};
