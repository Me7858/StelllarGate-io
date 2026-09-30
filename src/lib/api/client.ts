// Thin fetch wrapper for the zenith-backend API. Caching/retry live in
// TanStack Query; this standardizes the request/error shape and, when a
// schema is passed, validates the response at runtime (ContractError).
import type { z } from "zod";
import { ContractError, reportContractError } from "./contractError";

type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

import { activeStellarNetwork, env } from "../../env";
import { BFF_PREFIX, BFF_SESSION_ROUTE, CSRF_COOKIE, CSRF_HEADER } from "../bff/constants";

interface RuntimeConfig {
  apiUrl: string;
  network: "testnet" | "mainnet";
  rpcUrl: string;
  passphrase: string;
  contractId: string | null;
}

let runtimeConfigPromise: Promise<RuntimeConfig> | undefined;

export function getRuntimeConfig(): Promise<RuntimeConfig> {
  runtimeConfigPromise ??= typeof window === "undefined"
    ? Promise.resolve({
        apiUrl: env.NEXT_PUBLIC_API_URL,
        network: env.NEXT_PUBLIC_STELLAR_NETWORK,
        rpcUrl: activeStellarNetwork.rpcUrl,
        passphrase: activeStellarNetwork.passphrase,
        contractId: activeStellarNetwork.contractId ?? null,
      })
    : fetch("/api/runtime-config", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`Runtime config request failed (${response.status})`);
        return response.json() as Promise<RuntimeConfig>;
      });
  return runtimeConfigPromise;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * Authentication goes through the BFF (#118). In the browser every request
 * is sent to `/api/bff/<backend path>`, a same-origin route handler that
 * attaches the bearer token from an encrypted httpOnly cookie. JavaScript
 * never sees the token.
 *
 * The `token` parameter the api/* helpers still take is now a non-secret
 * *session marker* (BFF_SESSION_MARKER from the wallet store). It only
 * signals "this call expects a session" for 401 recovery. The cookie is
 * what actually authenticates.
 */
type AuthFlag = string | boolean | null | undefined;

/**
 * Injected by the wallet store (keeps this layer from importing it and
 * creating a cycle). Resolves truthy once a fresh session cookie is set,
 * or null if the user rejected / re-auth failed.
 */
type UnauthorizedHandler = () => Promise<string | null>;
let onUnauthorized: UnauthorizedHandler | null = null;
let reauthInFlight: Promise<string | null> | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

/** Single-flight: every concurrent 401 awaits the same re-auth call. */
function reauthenticate(): Promise<string | null> {
  if (!onUnauthorized) return Promise.resolve(null);
  if (!reauthInFlight) {
    reauthInFlight = onUnauthorized()
      .catch(() => null)
      .finally(() => {
        reauthInFlight = null;
      });
  }
  return reauthInFlight;
}

const isBrowser = () => typeof window !== "undefined";

/** Reads the (intentionally JS-readable) double-submit CSRF cookie. */
export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CSRF_COOKIE.secure || name === CSRF_COOKIE.insecure) return decodeURIComponent(rest.join("="));
  }
  return null;
}

let csrfBootstrap: Promise<void> | null = null;

/** GET /api/bff/session mints the CSRF cookie if it's missing. */
export async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfCookie();
  if (existing) return existing;
  csrfBootstrap ??= fetch(BFF_SESSION_ROUTE, { credentials: "same-origin", cache: "no-store" })
    .then(() => undefined)
    .finally(() => {
      csrfBootstrap = null;
    });
  await csrfBootstrap;
  return readCsrfCookie();
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Low-level authed fetch. In the browser it goes through the BFF and adds
 * CSRF headers. On the server it calls the backend directly and without
 * auth: server renders never carry a user session.
 */
export async function bffFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!isBrowser()) {
    const { apiUrl } = await getRuntimeConfig();
    return fetch(`${apiUrl}${path}`, { ...init, headers });
  }
  if (MUTATING.has(method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }
  return fetch(`${BFF_PREFIX}${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store" });
}

async function request<T>(path: string, init: RequestInit, token?: AuthFlag, schema?: Schema<T>, retried = false): Promise<T> {
  const res = await bffFetch(path, init);

  // Only authed requests are recovered; auth endpoints (nonce) never loop.
  if (res.status === 401 && token && !retried && !path.startsWith("/api/v1/auth/")) {
    const fresh = await reauthenticate();
    if (!fresh) throw new ApiError(401, "Session expired");
    const method = (init.method ?? "GET").toUpperCase();
    // Never silently replay non-idempotent calls (open/close/roll): the
    // session is restored, but the user must re-confirm the action.
    if (method !== "GET") throw new ApiError(401, "Session restored — please confirm and retry this action");
    return request<T>(path, init, fresh, true);
  }

  if (!res.ok) {
    let message = res.statusText || `request failed with ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Body wasn't JSON (or was empty) — keep the statusText fallback.
    }
    throw new ApiError(res.status, message);
  }

  // Some successful responses (e.g. POST /watchlist's 201, DELETE's 204)
  // have no body at all — checking status codes for this is brittle
  // (easy to miss one), so just check whether there's actually anything
  // to parse instead.
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const err = new ContractError(path, parsed.error.issues);
    reportContractError(err);
    throw err;
  }
  return parsed.data;
}

export function apiGet<T>(path: string, token?: AuthFlag, schema?: Schema<T>): Promise<T> {
  return request<T>(path, { method: "GET" }, token, schema);
}

export function apiPost<T>(path: string, body?: unknown, token?: AuthFlag, schema?: Schema<T>): Promise<T> {
  return request<T>(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    token,
    schema
  );
}

export function apiDelete<T>(path: string, token?: AuthFlag): Promise<T> {
  return request<T>(path, { method: "DELETE" }, token);
}

/**
 * WebSocket URL. The spot/chain feeds are public, so they connect straight
 * to the backend and need no auth ticket. If an authed feed is ever added,
 * mint a short-lived ticket via a BFF route rather than sending the session
 * cookie cross-origin (see README → Session & hydration).
 */
export async function wsUrl(path: string): Promise<string> {
  const { apiUrl } = await getRuntimeConfig();
  return `${apiUrl.replace(/^http/, "ws")}${path}`;
}
