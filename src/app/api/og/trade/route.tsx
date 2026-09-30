import { ImageResponse } from "next/og";
import { ShareCardImage, CARD_SIZE } from "../../../../lib/share/cardImage";
import { getSigningSecret, verifyShareId, ShareConfigError } from "../../../../lib/share/payload";

export const runtime = "edge";

// Local font files (see ./fonts/NOTICE.md), bundled with the edge
// function via `new URL(..., import.meta.url)`. Loaded once per isolate.
const fonts = Promise.all([
  fetch(new URL("./fonts/fraunces-latin-600-normal.woff", import.meta.url)).then(r => r.arrayBuffer()),
  fetch(new URL("./fonts/ibm-plex-sans-latin-500-normal.woff", import.meta.url)).then(r => r.arrayBuffer()),
  fetch(new URL("./fonts/jetbrains-mono-latin-600-normal.woff", import.meta.url)).then(r => r.arrayBuffer()),
]);

const NO_STORE = { "cache-control": "no-store" };

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  let secret: string;
  try {
    secret = getSigningSecret();
  } catch (err) {
    if (err instanceof ShareConfigError) return new Response("Sharing is not configured", { status: 503, headers: NO_STORE });
    throw err;
  }
  const card = await verifyShareId(id, secret);
  if (!card) return new Response("Invalid or tampered share link", { status: 400, headers: NO_STORE });

  const [fraunces, plex, mono] = await fonts;
  return new ImageResponse(<ShareCardImage card={card} />, {
    ...CARD_SIZE,
    fonts: [
      { name: "Fraunces", data: fraunces, weight: 600, style: "normal" },
      { name: "Plex", data: plex, weight: 500, style: "normal" },
      { name: "Mono", data: mono, weight: 600, style: "normal" },
    ],
    // A signed id fully determines the image, so it can be cached hard.
    // Kept to a week at the CDN (not "immutable") so rotating the signing
    // secret actually retires old cards within a bounded time.
    headers: { "cache-control": "public, max-age=86400, s-maxage=604800" },
  });
}
