// Multi-list watchlist API (v2). The backend doesn't implement this yet;
// this is the contract the frontend is written against. Until it exists,
// GET /api/v1/watchlists 404s and WatchlistsProvider keeps lists in
// localStorage instead, uploading them the first time the server answers.
//
//   GET    /api/v1/watchlists            → NamedWatchlist[] (ascending `position`)
//   POST   /api/v1/watchlists            { name, symbols? }   → 201 NamedWatchlist
//   PATCH  /api/v1/watchlists/:id        { name?, symbols? }  → NamedWatchlist
//            `symbols` replaces the whole ordered array (this is how a
//            reorder is saved); duplicates → 400.
//   DELETE /api/v1/watchlists/:id        → 204
//
// All bearer-authenticated. The existing single-set /api/v1/watchlist
// (favorites) is unchanged and still backs StarButton and tab ordering.
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { NamedWatchlist } from "./types";

export function listWatchlists(token: string): Promise<NamedWatchlist[]> {
  return apiGet("/api/v1/watchlists", token);
}

export function createWatchlist(params: { name: string; symbols?: string[] }, token: string): Promise<NamedWatchlist> {
  return apiPost("/api/v1/watchlists", params, token);
}

export function updateWatchlist(id: string, patch: { name?: string; symbols?: string[] }, token: string): Promise<NamedWatchlist> {
  return apiPatch(`/api/v1/watchlists/${encodeURIComponent(id)}`, patch, token);
}

export function deleteWatchlist(id: string, token: string): Promise<void> {
  return apiDelete(`/api/v1/watchlists/${encodeURIComponent(id)}`, token);
}
