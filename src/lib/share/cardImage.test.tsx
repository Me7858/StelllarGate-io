import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageResponse } from "next/og";
import { CARD_SIZE, ShareCardImage, fmtPct, fmtStrike } from "./cardImage";
import type { ShareCard } from "./payload";

const FONT_DIR = join(__dirname, "../../app/api/og/trade/fonts");
const font = (f: string) => readFileSync(join(FONT_DIR, f));

export const SAMPLE_TRADE: ShareCard = {
  v: 1, kind: "trade", underlying: "BTC", structure: "Short Put", status: "closed", expiryDays: 30,
  legs: [{ side: "put", action: "sell", strike: 60000 }],
  pnlPct: 50, pnlLabel: "Realized return", pnlAbs: 300, wallet: "GCKF…MTGG",
  spark: { pts: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1], zero: 0.72, spotX: 0.58 },
  iat: 1_790_000_000,
};

describe("share card image", () => {
  it("matches the markup snapshot", () => {
    expect(renderToStaticMarkup(<ShareCardImage card={SAMPLE_TRADE} />)).toMatchSnapshot();
  });

  it("omits hidden fields from the rendered card", () => {
    const html = renderToStaticMarkup(<ShareCardImage card={{ ...SAMPLE_TRADE, pnlAbs: undefined, wallet: undefined }} />);
    expect(html).not.toContain("$300");
    expect(html).not.toContain("Trader");
  });

  it("renders a 1200×630 PNG through next/og with the bundled fonts", async () => {
    const res = new ImageResponse(<ShareCardImage card={SAMPLE_TRADE} />, {
      ...CARD_SIZE,
      fonts: [
        { name: "Fraunces", data: font("fraunces-latin-600-normal.woff"), weight: 600, style: "normal" },
        { name: "Plex", data: font("ibm-plex-sans-latin-500-normal.woff"), weight: 500, style: "normal" },
        { name: "Mono", data: font("jetbrains-mono-latin-600-normal.woff"), weight: 600, style: "normal" },
      ],
    });
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    // IHDR: width and height are big-endian u32s at bytes 16 and 20.
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }, 30_000);
});

describe("formatters", () => {
  it("fmtPct signs and compacts", () => {
    expect(fmtPct(49.97)).toBe("+50.0%");
    expect(fmtPct(-12.345)).toBe("−12.3%");
    expect(fmtPct(250)).toBe("+250%");
    expect(fmtPct(123456)).toBe("+123k%");
    expect(fmtPct(null)).toBe("—");
  });

  it("fmtStrike groups large strikes and keeps precision on small ones", () => {
    expect(fmtStrike(67420.5)).toBe("67,420.50");
    expect(fmtStrike(182.45)).toBe("182.45");
    expect(fmtStrike(0.1182)).toBe("0.1182");
  });
});
