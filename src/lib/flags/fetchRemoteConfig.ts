/**
 * Server-side remote config fetcher.
 * Called from the layout server component and the /api/flags route.
 *
 * Falls back to null (safe defaults) if the remote endpoint is
 * unreachable, returns an invalid response, or times out.
 *
 * Remote endpoint contract:
 *   GET <NEXT_PUBLIC_FLAGS_URL>  (defaults to /api/flags/config.json)
 *   Response: RemoteFlagConfig JSON
 *
 * Example config.json (host anywhere: CDN, S3, Vercel Edge Config, etc.):
 * {
 *   "flags": {
 *     "soroban_execution": true,
 *     "governance": false
 *   },
 *   "allowlists": {
 *     "soroban_execution": ["GABC...", "GDEF..."]
 *   }
 * }
 */

import type { RemoteFlagConfig } from "./resolve";

const FLAGS_URL =
  process.env.NEXT_PUBLIC_FLAGS_URL ??
  process.env.FLAGS_CONFIG_URL ??          // server-only env var (more secure)
  null;

const FETCH_TIMEOUT_MS = 3000;

export async function fetchRemoteConfig(): Promise<RemoteFlagConfig | null> {
  if (!FLAGS_URL) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(FLAGS_URL, {
      signal: controller.signal,
      // Next.js server fetch: revalidate every 60 s
      next: { revalidate: 60 },
    } as RequestInit);

    clearTimeout(timer);

    if (!res.ok) return null;

    const data = await res.json();

    // Validate shape minimally — unknown keys are just ignored
    if (data && typeof data === "object" && typeof data.flags === "object") {
      return data as RemoteFlagConfig;
    }

    return null;
  } catch {
    // Timeout, network error, parse error — safe fallback
    return null;
  }
}
