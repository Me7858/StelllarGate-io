// Runs the strategy search off the main thread so typing in the finder's
// inputs or dragging the target marker never stalls the UI.
import { searchStrategies, type FinderInput, type FinderMarket, type FinderResult } from "./engine";

export interface FinderRequest {
  id: number;
  input: FinderInput;
  market: FinderMarket;
}

export type FinderResponse =
  | { id: number; result: FinderResult; error?: undefined }
  | { id: number; result?: undefined; error: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<FinderRequest>) => void) | null;
  postMessage: (msg: FinderResponse) => void;
};

ctx.onmessage = (e) => {
  const { id, input, market } = e.data;
  try {
    ctx.postMessage({ id, result: searchStrategies(input, market) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : "Strategy search failed" });
  }
};
