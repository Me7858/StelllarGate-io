export interface DocHeading {
  id: string;
  title: string;
  level: number;
}

export interface DocPage {
  slug: string;
  title: string;
  category: "Getting Started" | "Protocol Mechanics" | "Risk & Collateral" | "Architecture & Reference";
  description: string;
  readTime: string;
  headings: DocHeading[];
  keywords: string[];
  sourceReference?: {
    file: string;
    lines?: string;
    url: string;
  };
}

export const DOCS_MANIFEST: DocPage[] = [
  {
    slug: "/docs",
    title: "Getting Started",
    category: "Getting Started",
    description: "Overview of Zenith Protocol on Stellar Soroban, core features, architecture, and quickstart guide.",
    readTime: "3 min read",
    headings: [
      { id: "what-is-zenith", title: "What is Zenith?", level: 2 },
      { id: "key-features", title: "Key Features", level: 2 },
      { id: "protocol-architecture", title: "Protocol Architecture", level: 2 },
      { id: "quickstart", title: "Quickstart Guide", level: 2 },
    ],
    keywords: ["getting started", "introduction", "zenith", "stellar", "soroban", "options", "defi"],
  },
  {
    slug: "/docs/options-basics",
    title: "Options Basics",
    category: "Getting Started",
    description: "Understand calls, puts, moneyness, option styles, and European exercise on Stellar.",
    readTime: "5 min read",
    headings: [
      { id: "core-concepts", title: "Core Concepts: Calls & Puts", level: 2 },
      { id: "option-buyers-vs-writers", title: "Buyers vs. Writers", level: 2 },
      { id: "moneyness", title: "Moneyness: ITM, ATM, OTM", level: 2 },
      { id: "european-style", title: "European Exercise on Zenith", level: 2 },
      { id: "available-markets", title: "Supported Underlyings", level: 2 },
    ],
    keywords: ["options", "calls", "puts", "strike", "expiry", "moneyness", "itm", "otm", "atm", "european"],
  },
  {
    slug: "/docs/pricing",
    title: "Pricing & Volatility Smile",
    category: "Protocol Mechanics",
    description: "Black-Scholes valuation formula, Greeks calculation, and realistic crypto volatility smile curve with interactive pricer.",
    readTime: "7 min read",
    sourceReference: {
      file: "src/lib/pricing.ts",
      lines: "54-82",
      url: "https://github.com/Zenith-options/frontend/blob/main/src/lib/pricing.ts#L54-L82",
    },
    headings: [
      { id: "pricing-overview", title: "Pricing Overview", level: 2 },
      { id: "black-scholes-formula", title: "Black-Scholes Formulation", level: 2 },
      { id: "interactive-pricer", title: "Interactive BS & Greeks Calculator", level: 2 },
      { id: "the-greeks", title: "The Greeks (Δ, Γ, Θ, V)", level: 2 },
      { id: "volatility-smile", title: "Crypto Volatility Smile Model", level: 2 },
      { id: "production-math-alignment", title: "Alignment with Production Math", level: 2 },
    ],
    keywords: ["pricing", "black-scholes", "greeks", "delta", "gamma", "theta", "vega", "volatility", "smile", "iv", "pricer"],
  },
  {
    slug: "/docs/collateral",
    title: "Collateral Rules",
    category: "Risk & Collateral",
    description: "Collateralization requirements for option writers: 100% spot for calls, 110% strike over-collateralization for puts.",
    readTime: "5 min read",
    sourceReference: {
      file: "src/lib/collateral.ts",
      lines: "8-10",
      url: "https://github.com/Zenith-options/frontend/blob/main/src/lib/collateral.ts#L8-L10",
    },
    headings: [
      { id: "why-collateral", title: "Why Collateral Matters", level: 2 },
      { id: "covered-calls", title: "Covered Calls (100% Spot)", level: 2 },
      { id: "cash-secured-puts", title: "Cash-Secured Puts (110% Over-Collateralization)", level: 2 },
      { id: "collateral-calculator", title: "Interactive Collateral Calculator", level: 2 },
      { id: "lock-and-release", title: "Locking & Release Lifecycle", level: 2 },
      { id: "code-implementation", title: "Code Reference", level: 2 },
    ],
    keywords: ["collateral", "margin", "covered calls", "cash secured puts", "lock", "over-collateralization", "safety"],
  },
  {
    slug: "/docs/payoff",
    title: "Payoff & Strategy Playground",
    category: "Protocol Mechanics",
    description: "Explore single-leg and multi-leg option payoffs, net premiums, and breakeven curves with live visualization.",
    readTime: "6 min read",
    sourceReference: {
      file: "src/lib/payoff.ts",
      lines: "12-37",
      url: "https://github.com/Zenith-options/frontend/blob/main/src/lib/payoff.ts#L12-L37",
    },
    headings: [
      { id: "payoff-mechanics", title: "Payoff Math at Expiry", level: 2 },
      { id: "multi-leg-strategies", title: "Multi-Leg Combinations", level: 2 },
      { id: "payoff-playground", title: "Interactive Payoff Playground", level: 2 },
      { id: "common-templates", title: "Strategy Templates", level: 2 },
      { id: "breakeven-analysis", title: "Breakeven & Max P&L Analysis", level: 2 },
    ],
    keywords: ["payoff", "strategies", "bull spread", "bear spread", "straddle", "iron condor", "pnl", "breakeven", "chart"],
  },
  {
    slug: "/docs/settlement",
    title: "Settlement & Exercise",
    category: "Protocol Mechanics",
    description: "European exercise mechanics, Reflector oracle price feeds, 24-hour settlement window, and non-custodial payouts.",
    readTime: "5 min read",
    headings: [
      { id: "settlement-lifecycle", title: "Settlement Lifecycle", level: 2 },
      { id: "reflector-oracle", title: "Reflector Oracle Feeds", level: 2 },
      { id: "exercise-window", title: "The 24-Hour Exercise Window", level: 2 },
      { id: "payout-math", title: "Intrinsic Payout Calculation", level: 2 },
      { id: "unclaimed-collateral", title: "Unclaimed Collateral Reclaim", level: 2 },
    ],
    keywords: ["settlement", "exercise", "oracle", "reflector", "expiration", "payout", "soroban"],
  },
  {
    slug: "/docs/fees",
    title: "Fees & Economics",
    category: "Protocol Mechanics",
    description: "Protocol fee structure, trading fees, writer rebates, and Stellar Soroban gas dynamics.",
    readTime: "4 min read",
    headings: [
      { id: "fee-breakdown", title: "Fee Structure", level: 2 },
      { id: "trading-fees", title: "Trading Fees", level: 2 },
      { id: "soroban-gas", title: "Stellar Network Gas Costs", level: 2 },
      { id: "treasury-allocation", title: "Protocol Treasury & Economics", level: 2 },
    ],
    keywords: ["fees", "gas", "stellar", "soroban", "rebates", "treasury", "economics"],
  },
  {
    slug: "/docs/risks",
    title: "Risk Disclosures & Edge Cases",
    category: "Risk & Collateral",
    description: "Comprehensive risk disclosures: tail risk, gamma/delta exposure, oracle latency, and portfolio stress testing.",
    readTime: "6 min read",
    sourceReference: {
      file: "src/lib/risk.ts",
      lines: "42-78",
      url: "https://github.com/Zenith-options/frontend/blob/main/src/lib/risk.ts#L42-L78",
    },
    headings: [
      { id: "writer-risk", title: "Option Writer Risk (Short Gamma)", level: 2 },
      { id: "buyer-risk", title: "Option Buyer Risk (Premium Decay)", level: 2 },
      { id: "oracle-risk", title: "Oracle Latency & Deviation", level: 2 },
      { id: "smart-contract-risk", title: "Smart Contract & Soroban Risks", level: 2 },
      { id: "portfolio-stress-testing", title: "Portfolio Stress Testing", level: 2 },
    ],
    keywords: ["risk", "disclosures", "gamma", "theta", "tail risk", "oracle", "stress test", "safety"],
  },
  {
    slug: "/docs/contracts",
    title: "Smart Contracts & Architecture",
    category: "Architecture & Reference",
    description: "Soroban Rust contract architecture, state storage, token allowances, and on-chain interfaces.",
    readTime: "6 min read",
    headings: [
      { id: "contract-overview", title: "Soroban Contract Architecture", level: 2 },
      { id: "state-storage", title: "Instance & Persistent Storage", level: 2 },
      { id: "token-allowances", title: "SEP-41 Token Allowances", level: 2 },
      { id: "contract-interfaces", title: "Key Contract Functions", level: 2 },
      { id: "security-audits", title: "Security & Invariants", level: 2 },
    ],
    keywords: ["contracts", "rust", "soroban", "stellar", "sep-41", "storage", "wasm", "security"],
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  const normalized = slug === "/docs" ? "/docs" : slug.replace(/\/$/, "");
  return DOCS_MANIFEST.find((doc) => doc.slug === normalized);
}

export function getDocNeighbors(slug: string): { prev?: DocPage; next?: DocPage } {
  const normalized = slug === "/docs" ? "/docs" : slug.replace(/\/$/, "");
  const index = DOCS_MANIFEST.findIndex((doc) => doc.slug === normalized);
  if (index === -1) return {};
  return {
    prev: index > 0 ? DOCS_MANIFEST[index - 1] : undefined,
    next: index < DOCS_MANIFEST.length - 1 ? DOCS_MANIFEST[index + 1] : undefined,
  };
}

export function searchDocs(query: string): DocPage[] {
  if (!query || query.trim().length === 0) return [];
  const q = query.toLowerCase().trim();
  return DOCS_MANIFEST.filter((doc) => {
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.description.toLowerCase().includes(q) ||
      doc.keywords.some((k) => k.toLowerCase().includes(q)) ||
      doc.headings.some((h) => h.title.toLowerCase().includes(q))
    );
  });
}
