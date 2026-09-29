# Zenith Frontend

Next.js 14 (App Router) options trading terminal for Zenith, a decentralized
options protocol on Stellar Soroban. Options chain, portfolio, trade history,
multi-leg strategy builder, and a vol surface — all in a dense,
Bloomberg-style dark UI.

## Status: wired up to the real backend

Account, positions, trade history, watchlist, and alerts all come from the
real backend API now (`src/lib/api/*.ts`), not `localStorage` — the local
zustand stores for those were removed once the backend versions replaced
them; `src/lib/store/` now holds only `wallet.ts`. A shared WebSocket
connection (`src/lib/context/SpotFeedContext.tsx`) feeds live spot/vol
ticks into the options chain and portfolio pages. Wallet sign-in is a real
end-to-end flow: connect via Freighter → request a nonce → sign it with
`freighterApi.signBlob` → verify with the backend → store the returned
bearer token and send it as `Authorization: Bearer <token>` on every authed
request (`src/lib/store/wallet.ts`). That said, the signature encoding
hasn't been manually confirmed against a live Freighter extension (no
extension available in this environment) — the flow is logically complete,
not hardware-tested.

Client-side Black-Scholes pricing (`src/lib/pricing.ts`) hasn't gone away —
it's now a fallback and preview layer rather than the primary source: the
options chain falls back to it if the backend fetch fails, per-row live
Greeks in the positions table are computed locally rather than
round-tripped, and multi-leg strategy *preview* pricing (before execution)
is local-only. The backend's `/api/v1/portfolio/payoff` endpoint has a
typed client (`src/lib/api/payoff.ts`) but nothing in the app calls it yet —
the payoff diagram still uses local math (`src/lib/payoff.ts`).

## Getting started

```bash
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL, defaults to http://localhost:8081
npm run dev
# http://localhost:3000
```

Run the [backend](https://github.com/Zenith-options/backend) alongside it
(`cargo run`, default port 8081) for account/positions/history/watchlist/
alerts/live spot to actually load — without it, only the home page's local
preview chain and the options chain's client-side BS fallback will render.

```bash
npm run build   # production build
npm run lint     # next lint
```

## Pages

| Route | What's there |
|---|---|
| `/` | Marketing/landing page, live preview chain, watchlist |
| `/options` | The terminal: chain, positions, strategy builder, vol surface |
| `/portfolio` | Open positions marked-to-market, roll, close, CSV export, portfolio-wide risk panel |
| `/history` | Full trade ledger (opens + closes) with realized P&L stats |

The `/options` page is tabbed:

- **Chain** — live options chain for XLM/BTC/ETH/SOL. Click an ask to buy, a
  bid to write (sell) and collect premium.
- **Positions** — quick view of open positions for the selected symbol;
  "Manage →" links to `/portfolio` for the actual close/roll actions.
- **Strategies** — templated multi-leg trades (straddle, bull call spread,
  bear put spread, iron condor) with a combined payoff diagram, executed
  atomically.
- **Surface** — an IV heatmap across strikes and expiries, with a simple
  term-structure model (skew dampens for longer-dated options).

## Architecture

Options module map (`src/app/options/_components/`): `MarketHeader` (symbol
tabs, spot, expiries), `MarketSidebar`, `ViewTabs`, `ChainTable` +
`useOptionChain` (fetch, 4s polling, Black-Scholes fallback), `TradeTicket` +
`useTradeTicket` (validation, collateral, funds), `PositionsTab`,
`StrategiesTab` + `useStrategyPreview`, `SurfaceTab`, `PortfolioBar`,
`StatusBar`. `page.tsx` only composes them.

```
src/
├── app/                  # Next.js App Router pages
│   ├── layout.tsx        # Mounts SpotFeedProvider + BackendDataProvider at the root
│   ├── page.tsx          # Home
│   ├── options/          # Chain / Positions / Strategies / Surface
│   ├── portfolio/        # Open positions, roll, close
│   └── history/          # Trade ledger
├── components/           # UI components (charts, dialogs, header, etc.)
└── lib/
    ├── api/              # Typed backend client: one file per domain
    │   ├── client.ts     # fetchJson + wsUrl(), NEXT_PUBLIC_API_URL, bearer auth header
    │   ├── market.ts, positions.ts, watchlist.ts, alerts.ts, history.ts,
    │   │   strategies.ts, auth.ts, ws.ts, payoff.ts (client exists, unused)
    │   └── types.ts      # Response shapes mirroring the backend's
    ├── hooks/             # useBackend{Account,Positions,Watchlist,Alerts,History},
    │                      # useSpotFeed (WS reconnect w/ backoff)
    ├── context/
    │   ├── BackendDataContext.tsx  # one shared account/positions/watchlist/alerts instance
    │   └── SpotFeedContext.tsx     # one shared WebSocket connection app-wide
    ├── store/             # zustand + persist — now just wallet.ts (connect,
    │                      # sign-in-with-backend, bearer token)
    ├── pricing.ts        # Black-Scholes, vol smile — fallback/preview layer, see above
    ├── collateral.ts     # Collateral requirements (100% calls, 110% puts)
    ├── payoff.ts          # Multi-leg combined payoff math (local; backend equivalent unused)
    ├── risk.ts             # Whole-portfolio risk: groups all open positions per
    │                       # underlying into one payoff curve, stress-tests the
    │                       # account across a spot-shock grid
    ├── volSurface.ts      # Term-structure-aware IV surface grid
    ├── strategies.ts      # Multi-leg strategy templates
    ├── csv.ts / notify.ts # CSV export, browser Notification wrapper
    ├── useHydrated.ts     # SSR-hydration-safety hook (see below) — still relevant for wallet.ts
    └── usePriceHistory.ts # In-memory spot sparkline buffer
```

### A note on hydration safety

`wallet.ts` is the one remaining persisted store, using `skipHydration: true`
plus `StoreHydrator` (mounted once in the root layout) to pull the real
`localStorage` token in after mount instead of at module-eval time. That
alone isn't sufficient for anything that reads the wallet's bearer token to
fetch backend data: passing a token before this component's own mount
effect has fired risks fetching (and rendering) data the server-rendered
HTML didn't have. `BackendDataProvider` (`src/lib/context/BackendDataContext.tsx`)
gates on `useHydrated()` and only passes the real token down to
`useBackendAccount`/`useBackendPositions`/etc. once hydrated — everything
else in `src/app/options/page.tsx` and `src/app/history/page.tsx` that
reads wallet-gated state follows the same pattern. If you add a new
component that reads the wallet token to fetch or render backend data, it
needs the same guard.

## Known gaps

- PWA: hand-written `public/sw.js` (no Serwist/Workbox dependency), production-only registration, SVG icons only (no PNG set), no Playwright offline tests and no Lighthouse run yet. Only last-known public spot prices are snapshotted (IndexedDB, wiped on disconnect); positions/account are not cached.
- No test suite.
- No on-chain/Soroban integration — the backend is a paper-trading API, not
  a wallet transaction signer against the contracts.
- Wallet sign-in (`signBlob` → verify → bearer token) hasn't been manually
  confirmed against a live Freighter extension — no extension available in
  this environment. The flow is logically complete, not hardware-tested.
- The home page's preview chain still runs its own local random-walk spot
  simulation rather than the shared WebSocket feed — only its watchlist is
  backend-real.
- The backend's `/api/v1/portfolio/payoff` endpoint has a typed client
  (`src/lib/api/payoff.ts`) but nothing calls it — the payoff diagram still
  computes locally (`src/lib/payoff.ts`). Multi-leg strategy *preview*
  pricing (before execution) is also local-only, not backend-priced.
- `src/app/options/page.tsx` is now a composition shell; feature modules live
  in `src/app/options/_components/` (see Options module map above).
- Accessibility is minimal — several controls (star toggle, alert form,
  contracts stepper) have no `aria-label`.

## License

MIT © Zenith Protocol Contributors

## API contracts

`src/lib/api/schemas.ts` holds a Zod schema per backend response; types in
`types.ts` are `z.infer`-derived. `request()` validates each response and throws
a `ContractError` (with per-field paths) on drift: shown in a dev overlay, sent
to `NEXT_PUBLIC_MONITOR_URL` in production. Extra backend fields are stripped;
numeric strings are coerced. `npm run api:check` validates the fixtures in
`contracts/fixtures/` (named after schema exports) and flags key drift.
