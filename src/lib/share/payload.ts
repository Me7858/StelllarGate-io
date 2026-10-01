// Signed, stateless share-card payloads. A share id is
//   base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, that base64url string))
// so /share/[id] and /api/og/trade can render a card with no database,
// and a tampered or hand-built id (a spoofed "+900%" card) fails
// verification. Web Crypto only, so this runs on the edge runtime and in
// Node alike.
//
// The payload holds only what the card displays, *after* privacy
// options are applied: a hidden field is absent, not just unrendered,
// and the sparkline is pre-normalized to 0–1 so no premiums or sizes
// ride along in the URL.

export const SHARE_PAYLOAD_VERSION = 1;
/** Hard cap on an id's length — anything longer is rejected before any parsing or crypto. */
export const MAX_SHARE_ID_LENGTH = 2048;
export const SPARK_POINTS = 48;

export interface ShareLeg {
  side: "call" | "put";
  action: "buy" | "sell";
  strike: number;
}

export interface ShareCard {
  v: typeof SHARE_PAYLOAD_VERSION;
  kind: "trade" | "strategy";
  underlying: string;
  /** e.g. "Short Put", "Iron Condor". */
  structure: string;
  status: "closed" | "rolled" | "preview";
  expiryDays: number;
  legs: ShareLeg[];
  /** Headline percentage — realized return for trades, max return on risk for previews. null when undefined (e.g. unbounded risk). */
  pnlPct: number | null;
  pnlLabel: string;
  /** Absolute P&L in USD. Absent when the sharer hid it. */
  pnlAbs?: number;
  /** Absent when the sharer hid it. */
  contracts?: number;
  /** Already-truncated wallet ("GABC…WXYZ"). The full address never enters a payload. */
  wallet?: string;
  /** Payoff curve, y normalized to 0–1 (1 = best), plus where P&L = 0 and spot sit on the same scales. */
  spark: { pts: number[]; zero: number; spotX: number | null };
  /** Issued-at, epoch seconds. */
  iat: number;
}

export class ShareConfigError extends Error {}

/** Server-only: never exposed through a NEXT_PUBLIC_ variable. */
export function getSigningSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SHARE_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new ShareConfigError("SHARE_SIGNING_SECRET must be set to at least 32 characters");
  }
  return secret;
}

// ---- base64url over UTF-8 ----

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of Array.from(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time comparison so verification time doesn't leak how many signature bytes matched. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---- validation ----

/** Collapse whitespace and cap length so oversized text can't blow out the card layout. */
export function clampText(s: unknown, max: number): string {
  const clean = String(s ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Structural check of a decoded payload. Returns a normalized card or
 * null. Runs on verified payloads too — a valid signature proves we
 * issued it, not that an older/buggy build issued something renderable.
 */
export function parseCard(raw: unknown): ShareCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== SHARE_PAYLOAD_VERSION) return null;
  if (c.kind !== "trade" && c.kind !== "strategy") return null;
  if (c.status !== "closed" && c.status !== "rolled" && c.status !== "preview") return null;
  if (!finite(c.expiryDays) || !finite(c.iat)) return null;
  if (!Array.isArray(c.legs) || c.legs.length < 1 || c.legs.length > 4) return null;
  const legs: ShareLeg[] = [];
  for (const l of c.legs as Record<string, unknown>[]) {
    if (!l || (l.side !== "call" && l.side !== "put") || (l.action !== "buy" && l.action !== "sell") || !finite(l.strike)) return null;
    legs.push({ side: l.side, action: l.action, strike: l.strike });
  }
  const spark = c.spark as Record<string, unknown> | undefined;
  if (!spark || !Array.isArray(spark.pts) || spark.pts.length > SPARK_POINTS * 2) return null;
  const pts = (spark.pts as unknown[]).map(Number);
  if (pts.some(p => !Number.isFinite(p) || p < 0 || p > 1) || !finite(spark.zero)) return null;
  if (c.pnlPct !== null && !finite(c.pnlPct)) return null;
  if (c.pnlAbs !== undefined && !finite(c.pnlAbs)) return null;
  if (c.contracts !== undefined && !finite(c.contracts)) return null;
  // Only the truncated "GABC…WXYZ" shape is accepted — checked on the raw
  // value, so a full address is refused rather than silently shortened.
  if (c.wallet !== undefined && !(typeof c.wallet === "string" && /^[A-Z0-9]{4}…[A-Z0-9]{4}$/.test(c.wallet))) return null;
  const wallet = c.wallet as string | undefined;
  return {
    v: SHARE_PAYLOAD_VERSION,
    kind: c.kind,
    underlying: clampText(c.underlying, 10),
    structure: clampText(c.structure, 28),
    status: c.status,
    expiryDays: c.expiryDays,
    legs,
    pnlPct: c.pnlPct as number | null,
    pnlLabel: clampText(c.pnlLabel, 28),
    ...(c.pnlAbs !== undefined ? { pnlAbs: c.pnlAbs as number } : {}),
    ...(c.contracts !== undefined ? { contracts: c.contracts as number } : {}),
    ...(wallet ? { wallet } : {}),
    spark: {
      pts,
      zero: Math.min(1, Math.max(0, spark.zero as number)),
      spotX: finite(spark.spotX) ? Math.min(1, Math.max(0, spark.spotX)) : null,
    },
    iat: c.iat,
  };
}

// ---- sign / verify ----

export async function signCard(card: ShareCard, secret: string): Promise<string> {
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify(card)));
  const sig = bytesToB64url(await hmac(secret, payload));
  const id = `${payload}.${sig}`;
  if (id.length > MAX_SHARE_ID_LENGTH) throw new Error("share payload too large");
  return id;
}

/** The card if `id` carries a valid signature and a well-formed payload, else null. */
export async function verifyShareId(id: string, secret: string): Promise<ShareCard | null> {
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_SHARE_ID_LENGTH) return null;
  const dot = id.indexOf(".");
  if (dot <= 0 || dot !== id.lastIndexOf(".")) return null;
  const payload = id.slice(0, dot);
  const sig = b64urlToBytes(id.slice(dot + 1));
  if (!sig || !b64urlToBytes(payload)) return null;
  if (!timingSafeEqual(sig, await hmac(secret, payload))) return null;
  try {
    return parseCard(JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)!)));
  } catch {
    return null;
  }
}
