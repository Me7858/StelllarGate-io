import { apiGet } from "./client";
import { BSResultSchema, ExpiryCalendarSchema, IvResultSchema, OptionChainSchema, SpotResponseSchema } from "./schemas";
import type { BSResult, ExpiryCalendar, IvResult, OptionChainEntry, SpotResponse } from "./types";

export function getSpot(): Promise<SpotResponse> {
  return apiGet("/api/v1/spot", undefined, SpotResponseSchema);
}

export function getPrice(params: {
  underlying: string;
  strike: number;
  expiryDays: number;
  optionType: "call" | "put";
}): Promise<BSResult> {
  const q = new URLSearchParams({
    underlying: params.underlying,
    strike: String(params.strike),
    expiry_days: String(params.expiryDays),
    option_type: params.optionType,
  });
  return apiGet(`/api/v1/price?${q}`, undefined, BSResultSchema);
}

export function getChain(underlying: string, expiryDays: number): Promise<OptionChainEntry[]> {
  const q = new URLSearchParams({ underlying, expiry_days: String(expiryDays) });
  return apiGet(`/api/v1/chain?${q}`, undefined, OptionChainSchema);
}

export function getImpliedVol(params: {
  underlying: string;
  strike: number;
  expiryDays: number;
  optionType: "call" | "put";
  marketPrice: number;
}): Promise<IvResult> {
  const q = new URLSearchParams({
    underlying: params.underlying,
    strike: String(params.strike),
    expiry_days: String(params.expiryDays),
    option_type: params.optionType,
    market_price: String(params.marketPrice),
  });
  return apiGet(`/api/v1/iv?${q}`, undefined, IvResultSchema);
}

export function getExpiryCalendar(underlying: string): Promise<ExpiryCalendar> {
  return apiGet(`/api/v1/expiries/${underlying}`, undefined, ExpiryCalendarSchema);
}
