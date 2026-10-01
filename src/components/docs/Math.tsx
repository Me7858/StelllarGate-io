"use client";

import React, { useMemo } from "react";
import katex from "katex";

export interface MathProps {
  math: string;
  block?: boolean;
  className?: string;
}

export function Math({ math, block = false, className = "" }: MathProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: block,
        throwOnError: false,
      });
    } catch {
      return math;
    }
  }, [math, block]);

  if (block) {
    return (
      <div
        className={`my-4 overflow-x-auto py-3 text-center text-zn-hi ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className={`inline-block px-1 align-baseline text-zn-hi ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function InlineMath({ math, className }: { math: string; className?: string }) {
  return <Math math={math} block={false} className={className} />;
}

export function BlockMath({ math, className }: { math: string; className?: string }) {
  return <Math math={math} block={true} className={className} />;
}
