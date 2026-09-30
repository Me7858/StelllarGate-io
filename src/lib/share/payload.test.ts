import { describe, expect, it } from "vitest";
import {
  MAX_SHARE_ID_LENGTH,
  ShareConfigError,
  clampText,
  getSigningSecret,
  parseCard,
  signCard,
  verifyShareId,
  type ShareCard,
} from "./payload";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const card: ShareCard = {
  v: 1, kind: "trade", underlying: "BTC", structure: "Short Put", status: "closed", expiryDays: 30,
  legs: [{ side: "put", action: "sell", strike: 60000 }],
  pnlPct: 49.97, pnlLabel: "Realized return",
  spark: { pts: [0, 0.5, 1, 1], zero: 0.4, spotX: 0.6 },
  iat: 1_790_000_000,
};

// Flip one base64url character to a different valid one.
const flip = (s: string, at: number) => s.slice(0, at) + (s[at] === "A" ? "B" : "A") + s.slice(at + 1);

describe("share signatures", () => {
  it("round-trips a signed card", async () => {
    const id = await signCard(card, SECRET);
    expect(id).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifyShareId(id, SECRET)).toEqual(card);
  });

  it("is deterministic for the same card and secret", async () => {
    expect(await signCard(card, SECRET)).toBe(await signCard(card, SECRET));
  });

  it("rejects a tampered payload (a spoofed P&L)", async () => {
    const id = await signCard(card, SECRET);
    const [, sig] = id.split(".");
    const forged = btoa(JSON.stringify({ ...card, pnlPct: 900 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyShareId(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(await verifyShareId(flip(id, 5), SECRET)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const id = await signCard(card, SECRET);
    expect(await verifyShareId(flip(id, id.length - 3), SECRET)).toBeNull();
    expect(await verifyShareId(id.slice(0, -2), SECRET)).toBeNull();
  });

  it("rejects ids signed with a different secret", async () => {
    const id = await signCard(card, SECRET);
    expect(await verifyShareId(id, SECRET + "x")).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["no signature", "abc"],
    ["two dots", "a.b.c"],
    ["leading dot", ".abc"],
    ["bad alphabet", "ab$c.def"],
    ["oversized", "a".repeat(MAX_SHARE_ID_LENGTH + 1) + ".b"],
  ])("rejects malformed ids (%s)", async (_, id) => {
    expect(await verifyShareId(id, SECRET)).toBeNull();
  });

  it("rejects a validly signed but malformed payload", async () => {
    const bad = { ...card, legs: [] } as unknown as ShareCard;
    expect(await verifyShareId(await signCard(bad, SECRET), SECRET)).toBeNull();
  });
});

describe("getSigningSecret", () => {
  it("requires a server-side secret of at least 32 characters", () => {
    expect(() => getSigningSecret({})).toThrow(ShareConfigError);
    expect(() => getSigningSecret({ SHARE_SIGNING_SECRET: "short" })).toThrow(ShareConfigError);
    expect(getSigningSecret({ SHARE_SIGNING_SECRET: SECRET })).toBe(SECRET);
  });

  it("ignores a NEXT_PUBLIC_ variant", () => {
    expect(() => getSigningSecret({ NEXT_PUBLIC_SHARE_SIGNING_SECRET: SECRET })).toThrow(ShareConfigError);
  });
});

describe("parseCard", () => {
  it("clamps oversized text", () => {
    const parsed = parseCard({ ...card, structure: "X".repeat(500), underlying: "Y".repeat(50) })!;
    expect(parsed.structure.length).toBeLessThanOrEqual(28);
    expect(parsed.structure.endsWith("…")).toBe(true);
    expect(parsed.underlying.length).toBeLessThanOrEqual(10);
  });

  it("refuses anything that looks like a full wallet address", () => {
    const full = "G" + "A".repeat(55);
    expect(parseCard({ ...card, wallet: full })).toBeNull();
    expect(parseCard({ ...card, wallet: "GABC…WXYZ" })!.wallet).toBe("GABC…WXYZ");
  });

  it("rejects out-of-range sparkline points and unknown versions", () => {
    expect(parseCard({ ...card, spark: { ...card.spark, pts: [2] } })).toBeNull();
    expect(parseCard({ ...card, v: 2 })).toBeNull();
    expect(parseCard({ ...card, pnlPct: "lots" })).toBeNull();
    expect(parseCard({ ...card, legs: Array(5).fill(card.legs[0]) })).toBeNull();
  });

  it("clampText collapses whitespace", () => {
    expect(clampText("  a \n\t b  ", 10)).toBe("a b");
  });
});
