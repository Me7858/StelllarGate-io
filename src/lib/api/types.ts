// Types are derived from the Zod schemas in ./schemas.ts (z.infer), so the
// runtime validation and the static types cannot drift apart. Field names
// are snake_case to match the backend's serde output.
import type { z } from "zod";
import type * as S from "./schemas";

export type BSResult = z.infer<typeof S.BSResultSchema>;
export type SpotResponse = z.infer<typeof S.SpotResponseSchema>;
export type OptionChainEntry = z.infer<typeof S.OptionChainEntrySchema>;
export type ExpiryInfo = z.infer<typeof S.ExpiryInfoSchema>;
export type ExpiryCalendar = z.infer<typeof S.ExpiryCalendarSchema>;
export type IvResult = z.infer<typeof S.IvResultSchema>;
export type OptionType = z.infer<typeof S.OptionTypeSchema>;
export type PositionType = z.infer<typeof S.PositionTypeSchema>;
export type PositionStatus = z.infer<typeof S.PositionStatusSchema>;
export type Account = z.infer<typeof S.AccountSchema>;
export type Position = z.infer<typeof S.PositionSchema>;
export type HistoryStats = z.infer<typeof S.HistoryStatsSchema>;
export type HistoryResponse = z.infer<typeof S.HistoryResponseSchema>;
export type AggregateGreeks = z.infer<typeof S.AggregateGreeksSchema>;
export type WatchlistItem = z.infer<typeof S.WatchlistItemSchema>;
export type AlertCondition = z.infer<typeof S.AlertConditionSchema>;
export type Alert = z.infer<typeof S.AlertSchema>;
