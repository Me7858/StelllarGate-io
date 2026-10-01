import { apiGet, apiPost, type RequestOptions } from "./client";
import { AccountSchema, AggregateGreeksSchema, PositionListSchema, PositionSchema, RollResultSchema } from "./schemas";
import type { Account, AggregateGreeks, OptionType, Position, PositionStatus, PositionType } from "./types";

export function getAccount(token: string): Promise<Account> {
  return apiGet("/api/v1/account", token, AccountSchema);
}

export function listPositions(
  token: string,
  filters?: { status?: PositionStatus; strategyId?: string; limit?: number; offset?: number }
): Promise<Position[]> {
  const q = new URLSearchParams();
  if (filters?.status) q.set("status", filters.status);
  if (filters?.strategyId) q.set("strategy_id", filters.strategyId);
  if (filters?.limit !== undefined) q.set("limit", String(filters.limit));
  if (filters?.offset !== undefined) q.set("offset", String(filters.offset));
  const qs = q.toString();
  return apiGet(`/api/v1/positions${qs ? `?${qs}` : ""}`, token, PositionListSchema);
}

/** The backend's max page size for list endpoints. */
export const MAX_PAGE_SIZE = 200;

/**
 * Every matching position across all pages. The endpoint defaults to 50
 * rows per call, so a single unpaged call silently truncates larger
 * books — which would, among other things, make the collateral
 * reconciliation report a false discrepancy.
 */
export async function listAllPositions(
  token: string,
  filters?: { status?: PositionStatus; strategyId?: string }
): Promise<Position[]> {
  const all: Position[] = [];
  for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
    const page = await listPositions(token, { ...filters, limit: MAX_PAGE_SIZE, offset });
    all.push(...page);
    if (page.length < MAX_PAGE_SIZE) return all;
  }
}

export interface OpenPositionParams {
  underlying: string;
  strike: number;
  expiryDays: number;
  optionType: OptionType;
  positionType: PositionType;
  contracts: number;
}

/** Pass `opts.idempotencyKey` (see useIdempotencyKey) so a resubmitted Confirm can't open twice. */
export function openPosition(params: OpenPositionParams, token: string, opts?: RequestOptions): Promise<Position> {
  return apiPost(
    "/api/v1/positions/open",
    {
      underlying: params.underlying,
      strike: params.strike,
      expiry_days: params.expiryDays,
      option_type: params.optionType,
      position_type: params.positionType,
      contracts: params.contracts,
    },
    token,
    PositionSchema,
    opts
  );
}

export function closePosition(id: string, token: string, opts?: RequestOptions): Promise<Position> {
  return apiPost(`/api/v1/positions/${id}/close`, undefined, token, PositionSchema, opts);
}

export {
  closePositionPartial,
  closeStrategy,
  detectCloseFeatures,
  isUnsupportedCloseError,
  type ClosePositionBody,
  type FeatureFlags,
} from "./close";

export interface RollResult {
  closed?: Position;
  opened?: Position;
}

export function rollPosition(
  id: string,
  params: { newStrike: number; newExpiryDays: number },
  token: string,
  opts?: RequestOptions
): Promise<RollResult> {
  return apiPost(
    `/api/v1/positions/${id}/roll`,
    { new_strike: params.newStrike, new_expiry_days: params.newExpiryDays },
    token,
    RollResultSchema,
    opts
  );
}

export function getPortfolioGreeks(token: string): Promise<AggregateGreeks> {
  return apiGet("/api/v1/portfolio/greeks", token, AggregateGreeksSchema);
}
