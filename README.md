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
npm test         # vitest — contract verification unit tests
```

## Pages

| Route | What's there |
|---|---|
| `/` | Marketing/landing page, live preview chain, watchlist |
| `/options` | The terminal: chain, positions, strategy builder, vol surface |
| `/portfolio` | Open positions marked-to-market, roll, close, CSV export, portfolio-wide risk panel |
| `/history` | Full trade ledger (opens + closes) with realized P&L stats |
| `/contracts` | Contract registry — every contract per network, with a live deployed-WASM-hash check |
| `/contracts.json` | The same registry, machine-readable (`schema: zenith.contract-registry/1`) |

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

```
src/
├── app/                  # Next.js App Router pages
│   ├── layout.tsx        # Mounts SpotFeedProvider + BackendDataProvider at the root
│   ├── page.tsx          # Home
│   ├── options/          # Chain / Positions / Strategies / Surface
│   ├── portfolio/        # Open positions, roll, close
│   ├── history/          # Trade ledger
│   ├── contracts/        # Contract registry + live hash verification
│   └── contracts.json/   # Registry as JSON (route handler)
├── components/           # UI components (charts, dialogs, header, etc.)
└── lib/
    ├── api/              # Typed backend client: one file per domain
    │   ├── client.ts     # fetchJson + wsUrl(), NEXT_PUBLIC_API_URL, bearer auth header
    │   ├── market.ts, positions.ts, watchlist.ts, alerts.ts, history.ts,
    │   │   strategies.ts, auth.ts, ws.ts, payoff.ts (client exists, unused)
    │   └── types.ts      # Response shapes mirroring the backend's
    ├── hooks/             # useBackend{Account,Positions,Watchlist,Alerts,History},
    │                      # useSpotFeed (WS reconnect w/ backoff),
    │                      # useContractVerification (live contract hash check)
    ├── context/
    │   ├── BackendDataContext.tsx  # one shared account/positions/watchlist/alerts instance
    │   └── SpotFeedContext.tsx     # one shared WebSocket connection app-wide
    ├── soroban/
    │   ├── networks.ts    # Network passphrases, RPC endpoints (env-overridable), explorer links
    │   ├── registry.ts    # The contract registry: per-contract, per-network ID + WASM hash
    │   └── verify.ts      # getLedgerEntries on the instance key → hash comparison
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

## Contract registry (`/contracts`)

`/contracts` lists every Zenith contract per network with its contract ID,
expected WASM hash, deployed version, source commit, audit link, explorer
link, and upgrade history — and, for each one, **live-checks that the code
running at that address is the release the registry claims**.

The check is one `getLedgerEntries` call per network (the method takes up
to 200 keys, so all contracts are batched into a single round trip). A
Soroban contract's instance lives in a `CONTRACT_DATA` ledger entry whose
key is the `ScVal` `LedgerKeyContractInstance` — not a user-chosen symbol —
with persistent durability. Reading it yields a `ContractDataEntry` whose
`val.instance.executable` is either a WASM hash or, for built-in Stellar
Asset contracts, a `STELLAR_ASSET` variant with no hash at all. That hash is
compared against the registry.

| Status | Meaning | Blocks on-chain actions |
|---|---|---|
| `verified` | Deployed executable hash equals the expected release | no |
| `mismatch` | Hash differs, the ID is not a contract, or it is a built-in SAC | **yes** |
| `unverified` | RPC unreachable/timed out/unparseable | **yes** |
| `not-deployed` | No contract ID or expected hash recorded for this network | no |

The gating is **fail-closed** on purpose: `unverified` is an absence of
evidence, not evidence of safety, and treating an RPC outage as a green
light is exactly how a supply-chain swap gets through during an incident.
It never blocks *reading* — the page renders in every state. `blocksActions()`
in `verify.ts` is the single place that policy lives.

**Deployments are currently empty.** Zenith has no public deployment yet
(the backend is still a paper-trading API), so `registry.ts` ships with
`deployments: {}` rather than plausible-looking placeholder IDs — for a page
whose entire job is "is this the genuine contract?", invented IDs would be
actively harmful. The mechanism is live and exercised; it just has nothing
to compare against. Record a real deployment by filling in the `deployments`
block for the network in `src/lib/soroban/registry.ts`; an integrator
pointing at their own deployment can override the same shape via
`NEXT_PUBLIC_ZENITH_DEPLOYMENTS`.

What this does **not** cover, deliberately: it verifies that the code at an
address is the expected release, and nothing else. It says nothing about a
contract's storage, its admin, or its source — all of which an authorized
call can change without touching this hash — and reproducible-build
verification is out of scope.

### Tests

`npm test` runs the verification unit tests (`src/lib/soroban/verify.test.ts`),
which run against fixture ledger entries in
`src/lib/soroban/__fixtures__/ledgerEntries.ts`. Those fixtures are real XDR
produced by encoding the same structures the RPC returns, so a change in the
protocol's encoding surfaces as a failing test rather than a silently-passing
one. They cover the matching/mismatch paths, the built-in-SAC case, an
undecodable entry, out-of-order RPC responses, and RPC failure.


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

- No test suite for anything except the contract-verification module — that
  one has unit tests against fixture ledger entries; the rest of `src/lib`
  (pricing, risk, payoff, vol surface) is untested.
- No on-chain/Soroban integration — the backend is a paper-trading API, not
  a wallet transaction signer against the contracts. The `/contracts` page
  *reads* on-chain state (contract instance hashes via `getLedgerEntries`)
  but nothing in the app signs or submits a transaction, so the
  `blocksActions` policy in `verify.ts` has no on-chain call site to gate yet.
- The contract registry ships with no deployments recorded — see
  [Contract registry](#contract-registry-contracts) above.
- Wallet sign-in (`signBlob` → verify → bearer token) hasn't been manually
  confirmed against a live Freighter extension — no extension available in
  this environment. The flow is logically complete, not hardware-tested.
- The backend's `/api/v1/portfolio/payoff` endpoint has a typed client
  (`src/lib/api/payoff.ts`) but nothing calls it — the payoff diagram still
  computes locally (`src/lib/payoff.ts`). Multi-leg strategy *preview*
  pricing (before execution) is also local-only, not backend-priced.
- The home page's preview chain still runs its own local random-walk spot
  simulation rather than the shared WebSocket feed — only its watchlist is
  backend-real.
- `src/app/options/page.tsx` has grown large (chain + positions + strategies
  + surface + both trade panels + confirm dialogs) — a good candidate to
  split into sub-components before adding much more to it.
- Accessibility is minimal — several controls (star toggle, alert form,
  contracts stepper) have no `aria-label`.

## License

MIT © Zenith Protocol Contributors
