/**
 * MSW request handlers for Storybook and unit tests.
 *
 * Three pre-built sets are exported:
 *  - `handlers`        — happy-path with realistic delays
 *  - `loadingHandlers` — infinite-delay stubs (test loading states)
 *  - `errorHandlers`   — 500 responses (test error states)
 *
 * Individual stories can pass `parameters.msw.handlers` to override
 * specific routes while keeping the rest of the defaults.
 */
import { http, HttpResponse, delay } from 'msw';

export const API_BASE = 'http://localhost:8081';

// ---------------------------------------------------------------------------
// Shared mock data — import these into storybook-contexts.tsx too so the
// context providers and the network layer stay in sync.
// ---------------------------------------------------------------------------

export const mockAccount = {
  wallet_address: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZUE2CGKV8F1V5K8LDSF3',
  balance: 12_450.00,
  collateral_locked: 3_200.00,
  created_at: '2026-01-15T09:00:00Z',
};

export const mockWatchlist = [
  { wallet_address: mockAccount.wallet_address, underlying: 'XLM', added_at: '2026-09-01T00:00:00Z' },
  { wallet_address: mockAccount.wallet_address, underlying: 'BTC', added_at: '2026-09-02T00:00:00Z' },
];

export const mockPositions = [
  {
    id: 'pos-1',
    wallet_address: mockAccount.wallet_address,
    underlying: 'XLM',
    strike: 0.12,
    expiry_days: 31,
    option_type: 'call',
    position_type: 'long',
    contracts: 100,
    entry_premium: 0.0045,
    entry_spot: 0.1182,
    collateral: 0,
    status: 'open',
    close_premium: null,
    close_spot: null,
    realized_pnl: null,
    opened_at: '2026-09-20T10:00:00Z',
    closed_at: null,
    strategy_id: null,
  },
  {
    id: 'pos-2',
    wallet_address: mockAccount.wallet_address,
    underlying: 'XLM',
    strike: 0.10,
    expiry_days: 31,
    option_type: 'put',
    position_type: 'short',
    contracts: 50,
    entry_premium: 0.0031,
    entry_spot: 0.1182,
    collateral: 572.00,
    status: 'open',
    close_premium: null,
    close_spot: null,
    realized_pnl: null,
    opened_at: '2026-09-22T14:00:00Z',
    closed_at: null,
    strategy_id: null,
  },
];

export const mockHistory = {
  trades: [
    {
      id: 'pos-closed-1',
      wallet_address: mockAccount.wallet_address,
      underlying: 'XLM',
      strike: 0.11,
      expiry_days: 14,
      option_type: 'call',
      position_type: 'long',
      contracts: 75,
      entry_premium: 0.0038,
      entry_spot: 0.115,
      collateral: 0,
      status: 'closed',
      close_premium: 0.0071,
      close_spot: 0.1261,
      realized_pnl: 24.75,
      opened_at: '2026-09-10T08:00:00Z',
      closed_at: '2026-09-18T16:30:00Z',
      strategy_id: null,
    },
  ],
  stats: {
    trade_count: 1,
    win_count: 1,
    loss_count: 0,
    total_realized_pnl: 24.75,
  },
};

export const mockFeatures = {
  partial_close: true,
  strategy_close: true,
};

export const mockChain = [
  {
    strike: 0.106,
    expiry_days: 31,
    call: { premium: 0.0125, delta: 0.82, gamma: 0.18, theta: -0.00045, vega: 0.012, rho: 0.001, d1: 2.1, d2: 1.95, intrinsic: 0.0122, time_value: 0.0003, iv: 0.78 },
    put:  { premium: 0.0003, delta: -0.18, gamma: 0.18, theta: -0.00012, vega: 0.012, rho: -0.001, d1: 2.1, d2: 1.95, intrinsic: 0, time_value: 0.0003, iv: 0.81 },
    is_itm_call: true,
    is_itm_put: false,
  },
  {
    strike: 0.112,
    expiry_days: 31,
    call: { premium: 0.0078, delta: 0.61, gamma: 0.24, theta: -0.00052, vega: 0.018, rho: 0.0008, d1: 1.25, d2: 1.08, intrinsic: 0.0062, time_value: 0.0016, iv: 0.82 },
    put:  { premium: 0.0012, delta: -0.39, gamma: 0.24, theta: -0.00030, vega: 0.018, rho: -0.0008, d1: 1.25, d2: 1.08, intrinsic: 0, time_value: 0.0012, iv: 0.83 },
    is_itm_call: true,
    is_itm_put: false,
  },
  {
    strike: 0.118, // ~ATM
    expiry_days: 31,
    call: { premium: 0.0045, delta: 0.50, gamma: 0.28, theta: -0.00058, vega: 0.021, rho: 0.0006, d1: 0.31, d2: 0.12, intrinsic: 0.0002, time_value: 0.0043, iv: 0.83 },
    put:  { premium: 0.0043, delta: -0.50, gamma: 0.28, theta: -0.00055, vega: 0.021, rho: -0.0006, d1: 0.31, d2: 0.12, intrinsic: 0, time_value: 0.0043, iv: 0.84 },
    is_itm_call: false,
    is_itm_put: false,
  },
  {
    strike: 0.124,
    expiry_days: 31,
    call: { premium: 0.0021, delta: 0.30, gamma: 0.22, theta: -0.00042, vega: 0.016, rho: 0.0004, d1: -0.65, d2: -0.84, intrinsic: 0, time_value: 0.0021, iv: 0.85 },
    put:  { premium: 0.0079, delta: -0.70, gamma: 0.22, theta: -0.00061, vega: 0.016, rho: -0.0004, d1: -0.65, d2: -0.84, intrinsic: 0.0058, time_value: 0.0021, iv: 0.86 },
    is_itm_call: false,
    is_itm_put: true,
  },
  {
    strike: 0.130,
    expiry_days: 31,
    call: { premium: 0.0008, delta: 0.14, gamma: 0.14, theta: -0.00022, vega: 0.010, rho: 0.0002, d1: -1.55, d2: -1.74, intrinsic: 0, time_value: 0.0008, iv: 0.88 },
    put:  { premium: 0.0136, delta: -0.86, gamma: 0.14, theta: -0.00072, vega: 0.010, rho: -0.0002, d1: -1.55, d2: -1.74, intrinsic: 0.0118, time_value: 0.0018, iv: 0.87 },
    is_itm_call: false,
    is_itm_put: true,
  },
];

// ---------------------------------------------------------------------------
// Happy-path handlers — realistic network delays, successful responses
// ---------------------------------------------------------------------------

export const handlers = [
  http.get(`${API_BASE}/api/v1/account`, async () => {
    await delay(120);
    return HttpResponse.json(mockAccount);
  }),

  http.get(`${API_BASE}/api/v1/watchlist`, async () => {
    await delay(80);
    return HttpResponse.json(mockWatchlist);
  }),

  http.post(`${API_BASE}/api/v1/watchlist`, async () => {
    await delay(100);
    return new HttpResponse(null, { status: 201 });
  }),

  http.delete(`${API_BASE}/api/v1/watchlist/:sym`, async () => {
    await delay(100);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE}/api/v1/positions`, async () => {
    await delay(150);
    return HttpResponse.json(mockPositions);
  }),

  http.post(`${API_BASE}/api/v1/positions/open`, async () => {
    await delay(200);
    return HttpResponse.json(mockPositions[0], { status: 201 });
  }),

  http.post(`${API_BASE}/api/v1/positions/:id/close`, async ({ params }) => {
    await delay(200);
    const closed = {
      ...mockPositions[0],
      id: params.id as string,
      status: 'closed',
      close_premium: 0.0062,
      close_spot: 0.1195,
      realized_pnl: 17.00,
      closed_at: new Date().toISOString(),
    };
    return HttpResponse.json(closed);
  }),

  http.post(`${API_BASE}/api/v1/positions/:id/roll`, async ({ params }) => {
    await delay(250);
    return HttpResponse.json({
      closed: { ...mockPositions[0], id: params.id as string, status: 'rolled', closed_at: new Date().toISOString() },
      opened: { ...mockPositions[0], id: 'pos-rolled', opened_at: new Date().toISOString() },
    });
  }),

  http.post(`${API_BASE}/api/v1/strategies/execute`, async () => {
    await delay(250);
    return HttpResponse.json(mockPositions, { status: 201 });
  }),

  http.post(`${API_BASE}/api/v1/strategies/:id/close`, async () => {
    await delay(220);
    return HttpResponse.json(mockPositions.map(p => ({
      ...p,
      status: 'closed',
      close_premium: 0.0062,
      close_spot: 0.1195,
      realized_pnl: 8.50,
      closed_at: new Date().toISOString(),
    })));
  }),

  http.get(`${API_BASE}/api/v1/portfolio/greeks`, async () => {
    await delay(90);
    return HttpResponse.json({ delta: 0.42, gamma: 0.15, theta: -0.00058, vega: 0.021 });
  }),

  http.get(`${API_BASE}/api/v1/history`, async () => {
    await delay(150);
    return HttpResponse.json(mockHistory);
  }),

  http.get(`${API_BASE}/api/v1/features`, async () => {
    await delay(50);
    return HttpResponse.json(mockFeatures);
  }),

  http.get(`${API_BASE}/api/v1/chain/:sym`, async () => {
    await delay(180);
    return HttpResponse.json(mockChain);
  }),

  // Auth endpoints
  http.get(`${API_BASE}/api/v1/auth/nonce`, async () => {
    await delay(60);
    return HttpResponse.json({ nonce: 'mock-nonce-abc123', message: 'Sign this message to authenticate: mock-nonce-abc123' });
  }),

  http.post(`${API_BASE}/api/v1/auth/verify`, async () => {
    await delay(80);
    return HttpResponse.json({ token: 'mock-bearer-token', wallet_address: mockAccount.wallet_address });
  }),
];

// ---------------------------------------------------------------------------
// Loading handlers — stall selected endpoints forever to test skeleton UIs
// ---------------------------------------------------------------------------

export const loadingHandlers = [
  http.get(`${API_BASE}/api/v1/account`, async () => {
    await delay('infinite');
    return HttpResponse.json(mockAccount);
  }),

  http.get(`${API_BASE}/api/v1/watchlist`, async () => {
    await delay('infinite');
    return HttpResponse.json(mockWatchlist);
  }),

  http.get(`${API_BASE}/api/v1/positions`, async () => {
    await delay('infinite');
    return HttpResponse.json(mockPositions);
  }),

  http.get(`${API_BASE}/api/v1/history`, async () => {
    await delay('infinite');
    return HttpResponse.json(mockHistory);
  }),

  http.get(`${API_BASE}/api/v1/features`, async () => {
    await delay(50);
    return HttpResponse.json(mockFeatures);
  }),

  http.get(`${API_BASE}/api/v1/chain/:sym`, async () => {
    await delay('infinite');
    return HttpResponse.json(mockChain);
  }),
];

// ---------------------------------------------------------------------------
// Error handlers — 500 responses to test error boundaries and fallback UIs
// ---------------------------------------------------------------------------

export const errorHandlers = [
  http.get(`${API_BASE}/api/v1/account`, async () => {
    await delay(100);
    return new HttpResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  http.get(`${API_BASE}/api/v1/positions`, async () => {
    await delay(120);
    return new HttpResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  http.get(`${API_BASE}/api/v1/watchlist`, async () => {
    await delay(80);
    return new HttpResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  http.get(`${API_BASE}/api/v1/history`, async () => {
    await delay(120);
    return new HttpResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  http.get(`${API_BASE}/api/v1/features`, async () => {
    await delay(50);
    return HttpResponse.json(mockFeatures);
  }),

  http.get(`${API_BASE}/api/v1/chain/:sym`, async () => {
    await delay(100);
    return new HttpResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
];
