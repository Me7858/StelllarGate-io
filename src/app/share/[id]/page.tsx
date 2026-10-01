import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD_SIZE, fmtPct, fmtStrike } from "../../../lib/share/cardImage";
import { getSigningSecret, verifyShareId, type ShareCard } from "../../../lib/share/payload";

interface Props {
  params: { id: string };
}

async function load(id: string): Promise<ShareCard | null> {
  try {
    return await verifyShareId(decodeURIComponent(id), getSigningSecret());
  } catch {
    return null;
  }
}

function describe(card: ShareCard) {
  const title = `${card.underlying} ${card.structure} · ${fmtPct(card.pnlPct)}`;
  const strikes = card.legs.map(l => `${l.action === "buy" ? "long" : "short"} ${fmtStrike(l.strike)} ${l.side}`).join(", ");
  const description = `${card.pnlLabel} ${fmtPct(card.pnlPct)} on a ${Math.round(card.expiryDays)}-day ${card.underlying} ${card.structure.toLowerCase()} (${strikes}) — shared from Zenith, options on Stellar.`;
  return { title, description };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = await load(params.id);
  if (!card) return { title: "Share link not found · Zenith", robots: { index: false } };
  const { title, description } = describe(card);
  const image = { url: `/api/og/trade?id=${params.id}`, ...CARD_SIZE, alt: title };
  return {
    title: `${title} · Zenith`,
    description,
    // Shared cards are for link previews, not search results.
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", siteName: "Zenith", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function SharePage({ params }: Props) {
  const card = await load(params.id);
  if (!card) notFound();
  const { title, description } = describe(card);
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 16px", gap: 20 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the OG route already returns a sized PNG */}
      <img
        src={`/api/og/trade?id=${params.id}`}
        width={CARD_SIZE.width}
        height={CARD_SIZE.height}
        alt={title}
        style={{ width: "100%", maxWidth: 800, height: "auto", border: "1px solid var(--border-default)" }}
      />
      <p style={{ maxWidth: 800, fontSize: 13, color: "var(--text-mid)", textAlign: "center" }}>{description}</p>
      <Link href={`/options?u=${encodeURIComponent(card.underlying)}`} style={{
        padding: "10px 20px", background: "var(--brand)", color: "var(--bg)", fontSize: 13, fontWeight: 700, textDecoration: "none",
      }}>
        Open the {card.underlying} chain on Zenith →
      </Link>
    </main>
  );
}
