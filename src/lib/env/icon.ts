import { NETWORKS, type EnvironmentMode } from "./networks";

/**
 * The Zenith mark, framed in the mode's color, as an SVG string. Used both
 * for the static /icon route (paper, the default) and swapped in client-side
 * by EnvironmentProvider so a mainnet tab is recognisable from the tab strip.
 */
export function envIconSvg(mode: EnvironmentMode): string {
  const { color } = NETWORKS[mode];
  const dash = mode === "paper" ? ' stroke-dasharray="3 2"' : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect x="1.5" y="1.5" width="29" height="29" fill="#14130F" stroke="${color}" stroke-width="3"${dash}/>` +
    `<polygon points="16,7 24,23 8,23" stroke="#B59665" stroke-width="1.5" fill="rgba(181,150,101,0.14)" stroke-linejoin="round"/>` +
    `<polygon points="16,12 20.5,21 11.5,21" fill="#B59665" opacity="0.5"/>` +
    `</svg>`
  );
}

export function envIconDataUri(mode: EnvironmentMode): string {
  return `data:image/svg+xml,${encodeURIComponent(envIconSvg(mode))}`;
}

const PREFIX_RE = /^\[(PAPER|TESTNET|MAINNET)\]\s*/;

/** `base` with the mode's prefix, replacing any existing mode prefix. */
export function prefixedTitle(title: string, mode: EnvironmentMode): string {
  return `${NETWORKS[mode].titlePrefix} ${title.replace(PREFIX_RE, "")}`;
}
