import { describe, expect, it } from "vitest";
import { addSymbol, applyOrder, cleanName, moveItem, removeSymbol } from "./model";
import { SESSION_BUFFER_POINTS, appendSessionTicks } from "../hooks/useSpotFeed";

describe("watchlist model", () => {
  it("moves items and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const same = ["a", "b"];
    expect(moveItem(same, 0, 5)).toBe(same);
    expect(moveItem(same, 1, 1)).toBe(same);
  });

  it("never duplicates a symbol within a list", () => {
    expect(addSymbol(["BTC", "ETH"], "BTC")).toEqual(["BTC", "ETH"]);
    expect(addSymbol(["BTC"], "XLM")).toEqual(["BTC", "XLM"]);
    expect(removeSymbol(["BTC", "XLM"], "BTC")).toEqual(["XLM"]);
  });

  it("applies a saved favorites order, appending new symbols and dropping removed ones", () => {
    expect(applyOrder(["XLM", "BTC", "SOL"], ["SOL", "ETH", "XLM"])).toEqual(["SOL", "XLM", "BTC"]);
  });

  it("cleans list names", () => {
    expect(cleanName("  My   list ")).toBe("My list");
    expect(cleanName("x".repeat(80))).toHaveLength(40);
  });
});

describe("session price buffer", () => {
  it("keeps the first price as the session open and caps ticks", () => {
    let buf = { ticks: {}, open: {} };
    for (let i = 0; i < SESSION_BUFFER_POINTS + 10; i++) buf = appendSessionTicks(buf, { BTC: 100 + i }, i);
    expect(buf.open).toEqual({ BTC: { t: 0, price: 100 } });
    expect((buf.ticks as Record<string, unknown[]>).BTC).toHaveLength(SESSION_BUFFER_POINTS);
  });
});
