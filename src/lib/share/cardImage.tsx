// The share card's artwork, as plain JSX for next/og's ImageResponse
// (satori). Kept separate from the route handler so it can be rendered
// and snapshot-tested without the edge runtime. Satori supports a flexbox
// subset only: every element with more than one child needs display:flex.
import type { ShareCard } from "./payload";

export const CARD_SIZE = { width: 1200, height: 630 };

// Brand palette — same values as globals.css / icon.tsx.
const C = {
  bg: "#14130F", raised: "#1A1812", border: "rgba(245,238,220,0.10)",
  hi: "#F3EEE3", mid: "#9C9484", lo: "#5C5648",
  call: "#5C9A6B", put: "#B65640", brand: "#B59665",
};

export function fmtStrike(k: number): string {
  if (k >= 1000) {
    const [i, d] = k.toFixed(2).split(".");
    return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${d}`;
  }
  return k >= 1 ? k.toFixed(2) : k.toFixed(4);
}

export function fmtPct(p: number | null): string {
  if (p === null) return "—";
  const abs = Math.abs(p);
  const body = abs >= 10_000 ? `${Math.round(abs / 1000)}k` : abs >= 100 ? abs.toFixed(0) : abs.toFixed(1);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${body}%`;
}

function fmtUsd(v: number): string {
  const [i, d] = Math.abs(v).toFixed(2).split(".");
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}$${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${d}`;
}

const STATUS_LABEL: Record<ShareCard["status"], string> = { closed: "Closed trade", rolled: "Rolled trade", preview: "Strategy idea" };

function Sparkline({ spark, color, width, height }: { spark: ShareCard["spark"]; color: string; width: number; height: number }) {
  const n = spark.pts.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * width);
  const y = (v: number) => height - v * height;
  const line = spark.pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(spark.zero);
  // Shade only the profit side of the zero line — a same-colored fill
  // under the loss tails would read as more profit.
  const profit = spark.pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(Math.max(v, spark.zero)).toFixed(1)}`).join(" ");
  const area = `${profit} L${width},${zeroY.toFixed(1)} L0,${zeroY.toFixed(1)} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} fill={color} fillOpacity={0.14} />
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke={C.mid} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="6 6" />
      {spark.spotX !== null && (
        <line x1={spark.spotX * width} y1={0} x2={spark.spotX * width} y2={height} stroke={C.hi} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="4 6" />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ShareCardImage({ card }: { card: ShareCard }) {
  const positive = card.pnlPct === null ? null : card.pnlPct >= 0;
  const accent = positive === null ? C.brand : positive ? C.call : C.put;
  const strikes = card.legs.map(l => `${l.action === "buy" ? "+" : "−"}${fmtStrike(l.strike)}${l.side === "call" ? "C" : "P"}`).join("  ");
  const facts: [string, string][] = [
    ["Expiry", `${Math.round(card.expiryDays)}D`],
    ...(card.contracts !== undefined ? [["Size", `${card.contracts} ct`] as [string, string]] : []),
    ...(card.pnlAbs !== undefined ? [["P&L", fmtUsd(card.pnlAbs)] as [string, string]] : []),
    ...(card.wallet ? [["Trader", card.wallet] as [string, string]] : []),
  ];

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: C.bg, color: C.hi, padding: 56, fontFamily: "Plex",
      border: `2px solid ${C.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="40" height="40" viewBox="0 0 20 20" fill="none">
            <polygon points="10,2 18,18 2,18" stroke={C.brand} strokeWidth="1.5" fill="rgba(181,150,101,0.14)" strokeLinejoin="round" />
            <polygon points="10,7 14.5,16 5.5,16" fill={C.brand} opacity="0.5" />
          </svg>
          <div style={{ fontFamily: "Fraunces", fontSize: 34, color: C.hi }}>Zenith</div>
        </div>
        <div style={{
          display: "flex", padding: "8px 18px", border: `2px solid ${accent}`, color: accent,
          fontSize: 22, textTransform: "uppercase", letterSpacing: 2,
        }}>{STATUS_LABEL[card.status]}</div>
      </div>

      <div style={{ display: "flex", flex: 1, marginTop: 36, gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <div style={{ fontFamily: "Fraunces", fontSize: 72, lineHeight: 1 }}>{card.underlying}</div>
            <div style={{ fontSize: 32, color: C.mid, lineHeight: 1 }}>{card.structure}</div>
          </div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 26, color: C.mid, marginTop: 16 }}>{strikes}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
            <div style={{ fontSize: 22, color: C.lo, textTransform: "uppercase", letterSpacing: 2 }}>{card.pnlLabel}</div>
            <div style={{ fontFamily: "Mono", fontSize: 112, lineHeight: 1.05, color: accent }}>{fmtPct(card.pnlPct)}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <Sparkline spark={card.spark} color={accent} width={520} height={250} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: C.lo, marginTop: 10 }}>
            <div style={{ display: "flex" }}>Payoff at expiry</div>
            <div style={{ display: "flex" }}>{card.status === "preview" ? "- - spot" : "- - close spot"}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: `2px solid ${C.border}`, paddingTop: 22 }}>
        <div style={{ display: "flex", gap: 40 }}>
          {facts.map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 16, color: C.lo, textTransform: "uppercase", letterSpacing: 2 }}>{k}</div>
              <div style={{ fontFamily: "Mono", fontSize: 26, color: C.hi }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 16, color: C.lo }}>Options on Stellar · not financial advice</div>
      </div>
    </div>
  );
}
