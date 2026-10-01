import type { MDXComponents } from "mdx/types";
import React from "react";
import Link from "next/link";
import { BlackScholesPricer } from "./components/docs/calculators/BlackScholesPricer";
import { CollateralCalculator } from "./components/docs/calculators/CollateralCalculator";
import { PayoffPlayground } from "./components/docs/calculators/PayoffPlayground";
import { Math, InlineMath, BlockMath } from "./components/docs/Math";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children, ...props }) => (
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text-hi)",
          lineHeight: 1.25,
          marginBottom: 16,
          borderBottom: "1px solid var(--border-default)",
          paddingBottom: 12,
        }}
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, id, ...props }) => (
      <h2
        id={id}
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--text-hi)",
          lineHeight: 1.3,
          marginTop: 36,
          marginBottom: 12,
          scrollMarginTop: 64,
        }}
        {...props}
      >
        <a href={`#${id || ""}`} style={{ color: "inherit", textDecoration: "none" }}>
          {children}
        </a>
      </h2>
    ),
    h3: ({ children, id, ...props }) => (
      <h3
        id={id}
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 17,
          fontWeight: 600,
          color: "var(--text-hi)",
          lineHeight: 1.4,
          marginTop: 24,
          marginBottom: 8,
          scrollMarginTop: 64,
        }}
        {...props}
      >
        {children}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.7,
          color: "var(--text-hi)",
          opacity: 0.92,
          marginBottom: 16,
        }}
        {...props}
      >
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul
        style={{
          paddingLeft: 24,
          marginBottom: 16,
          color: "var(--text-hi)",
          fontSize: 14.5,
          lineHeight: 1.7,
        }}
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol
        style={{
          paddingLeft: 24,
          marginBottom: 16,
          color: "var(--text-hi)",
          fontSize: 14.5,
          lineHeight: 1.7,
        }}
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li style={{ marginBottom: 6 }} {...props}>
        {children}
      </li>
    ),
    a: ({ href, children, ...props }) => {
      const isInternal = href?.startsWith("/") || href?.startsWith("#");
      if (isInternal) {
        return (
          <Link
            href={href || "#"}
            style={{
              color: "var(--brand)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
            {...props}
          >
            {children}
          </Link>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--brand)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
          {...props}
        >
          {children}
        </a>
      );
    },
    blockquote: ({ children, ...props }) => (
      <blockquote
        style={{
          borderLeft: "3px solid var(--brand)",
          background: "var(--bg-elevated)",
          padding: "12px 18px",
          margin: "18px 0",
          fontStyle: "italic",
          color: "var(--text-mid)",
        }}
        {...props}
      >
        {children}
      </blockquote>
    ),
    code: ({ children, className, ...props }) => {
      return (
        <code
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.88em",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            padding: "2px 5px",
            borderRadius: 2,
            color: "var(--brand)",
          }}
          className={className}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-default)",
          padding: "16px 20px",
          borderRadius: 4,
          overflowX: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: 1.6,
          marginBottom: 20,
          color: "var(--text-hi)",
        }}
        {...props}
      >
        {children}
      </pre>
    ),
    table: ({ children, ...props }) => (
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            textAlign: "left",
          }}
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th
        style={{
          borderBottom: "1px solid var(--border-strong)",
          padding: "8px 12px",
          fontWeight: 600,
          color: "var(--text-hi)",
          background: "var(--bg-elevated)",
        }}
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          padding: "8px 12px",
          color: "var(--text-mid)",
        }}
        {...props}
      >
        {children}
      </td>
    ),
    hr: (props) => (
      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--border-default)",
          margin: "32px 0",
        }}
        {...props}
      />
    ),
    // Built-in components available directly in MDX
    BlackScholesPricer,
    CollateralCalculator,
    PayoffPlayground,
    Math,
    InlineMath,
    BlockMath,
    ...components,
  };
}
