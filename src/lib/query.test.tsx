import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAsyncQuery } from "./query";
import { ApiError } from "./api/client";
import { useWalletStore } from "./store/wallet";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useAsyncQuery", () => {
  it("is idle when disabled", () => {
    const { result } = renderHook(() => useAsyncQuery(null, async () => 1));
    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("loading → success", async () => {
    const d = deferred<number>();
    const { result } = renderHook(() => useAsyncQuery("k", () => d.promise));
    expect(result.current.status).toBe("loading");
    await act(async () => d.resolve(42));
    expect(result.current).toMatchObject({ status: "success", data: 42, error: null });
  });

  it("error keeps the last good data", async () => {
    let n = 0;
    const { result } = renderHook(() => useAsyncQuery("k", async () => { if (n++ === 0) return "ok"; throw new Error("down"); }));
    await waitFor(() => expect(result.current.status).toBe("success"));
    await act(async () => result.current.refetch());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toBe("ok");
    expect(result.current.error?.message).toBe("down");
  });

  it("drops data immediately on key change and ignores the old key's late response", async () => {
    const calls: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() };
    const { result, rerender } = renderHook(({ k }) => useAsyncQuery(k, () => calls[k].promise), { initialProps: { k: "a" } });
    rerender({ k: "b" });
    expect(result.current.status).toBe("loading");
    await act(async () => calls.a.resolve("from-a"));
    expect(result.current.data).toBeUndefined();
    await act(async () => calls.b.resolve("from-b"));
    expect(result.current.data).toBe("from-b");
  });

  it("an authed 401 clears the session token", async () => {
    useWalletStore.setState({ token: "expired" });
    const { result } = renderHook(() => useAsyncQuery("k", async () => { throw new ApiError(401, "unauthorized"); }, { authed: true }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(useWalletStore.getState().token).toBeNull();
  });
});
