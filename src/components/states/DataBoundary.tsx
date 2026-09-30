"use client";

import type { AuthStatus } from "../../lib/context/BackendDataContext";
import type { QueryState } from "../../lib/query";
import { AuthGate } from "./AuthGate";
import { ErrorState } from "./ErrorState";

interface Props<T> {
  query: QueryState<T>;
  /** Pass for data that needs a signed-in wallet; omit for public data. */
  auth?: AuthStatus;
  /** Layout-matching placeholder for loading (and unknown auth). */
  skeleton: React.ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  /** Custom not-signed-in state; defaults to a generic AuthGate. */
  signedOut?: React.ReactNode;
  errorTitle?: string;
  compact?: boolean;
  children: (data: T) => React.ReactNode;
}

/**
 * Renders exactly one of: skeleton, signed-out, error, empty, or content —
 * so no data surface can render "nothing" or a misleading zero while it
 * loads, fails, or has nobody signed in.
 *
 * Pre-hydration `auth` is "unknown" and renders the skeleton, which is
 * what the server rendered too — so SSR and the first client render match.
 */
export function DataBoundary<T>({
  query, auth, skeleton, isEmpty, empty, signedOut, errorTitle, compact = false, children,
}: Props<T>) {
  if (auth === "unknown" || auth === "signing-in") return <>{skeleton}</>;
  if (auth === "signed-out") return <>{signedOut ?? <AuthGate compact={compact} />}</>;

  const { status, data, error, refetch, isFetching } = query;
  if (status === "idle" || (status === "loading" && data === undefined)) return <>{skeleton}</>;
  if (data === undefined) {
    return <ErrorState title={errorTitle} error={error} onRetry={refetch} retrying={isFetching} compact={compact} />;
  }
  if (isEmpty?.(data) && empty) {
    return (
      <>
        {status === "error" && <ErrorState title={errorTitle} error={error} onRetry={refetch} retrying={isFetching} compact />}
        {empty}
      </>
    );
  }
  return (
    <>
      {/* A failed background refresh keeps showing the last good data, but says so. */}
      {status === "error" && (
        <ErrorState title="Couldn't refresh, showing last loaded data" error={error} onRetry={refetch} retrying={isFetching} compact />
      )}
      {children(data)}
    </>
  );
}
