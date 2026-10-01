import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import { DocsHeader } from "../../components/docs/DocsHeader";
import { DocsSidebar } from "../../components/docs/DocsSidebar";
import { DocsToc } from "../../components/docs/DocsToc";
import { DocsPageNav } from "../../components/docs/DocsPageNav";

export const metadata: Metadata = {
  title: {
    template: "%s | Zenith Protocol Docs",
    default: "Documentation | Zenith Protocol on Stellar",
  },
  description:
    "Comprehensive documentation for Zenith Protocol: Black-Scholes pricing model, volatility smile, collateralization rules, settlement lifecycles, fee schedules, and interactive risk calculators.",
  keywords: [
    "Zenith",
    "Stellar",
    "Soroban",
    "Options",
    "Black-Scholes",
    "Greeks",
    "Collateral",
    "Settlement",
    "DeFi",
    "Derivatives",
    "Calculators",
  ],
  openGraph: {
    title: "Zenith Protocol Documentation",
    description: "Protocol mechanics, pricing formulas, collateral requirements, and interactive financial calculators.",
    type: "website",
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        minHeight: "100vh",
        color: "var(--text-hi)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <DocsHeader />

      <div
        style={{
          display: "flex",
          flex: 1,
          width: "100%",
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        <DocsSidebar />

        <main
          style={{
            flex: 1,
            minWidth: 0,
            padding: "36px 48px 64px 48px",
          }}
          className="docs-main-content"
        >
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <article>{children}</article>
            <DocsPageNav />
          </div>
        </main>

        <DocsToc />
      </div>

      <style jsx global>{`
        @media (max-width: 820px) {
          .docs-main-content {
            padding: 24px 16px 48px 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
