"use client";

import type { CSSProperties } from "react";

// Skeletons are sized to match the content they stand in for (same row
// heights, same block sizes) so swapping in real data causes no layout
// shift. Shimmer is disabled under prefers-reduced-motion (globals.css).

export function Skeleton({ width = "100%", height = 12, style, className = "" }: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
  className?: string;
}) {
  return <span aria-hidden className={`skeleton ${className}`} style={{ display: "block", width, height, ...style }} />;
}

/** Wrapper announcing a loading region to assistive tech. */
export function SkeletonRegion({ label, children, style, testId }: {
  label: string;
  children: React.ReactNode;
  style?: CSSProperties;
  testId?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid={testId ?? "skeleton"} style={style}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** `rows` rows of `rowHeight`, each with `columns` cells — for tables and the chain. */
export function SkeletonRows({ rows, rowHeight, columns = 1, gap = 12, label = "Loading", testId }: {
  rows: number;
  rowHeight: number;
  columns?: number;
  gap?: number;
  label?: string;
  testId?: string;
}) {
  return (
    <SkeletonRegion label={label} testId={testId}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{
          height: rowHeight, display: "flex", alignItems: "center", gap, padding: "0 10px",
          borderBottom: "1px solid var(--border-subtle)",
        }}>
          {Array.from({ length: columns }, (_, j) => (
            <Skeleton key={j} height={Math.min(10, rowHeight - 8)} style={{ flex: 1, opacity: 0.6 + ((i + j) % 3) * 0.13 }} />
          ))}
        </div>
      ))}
    </SkeletonRegion>
  );
}
