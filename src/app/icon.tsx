import { ImageResponse } from "next/og";
import { envIconDataUri } from "../lib/env/icon";
import { DEFAULT_MODE } from "../lib/env/networks";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Static favicon for the default (paper) mode. EnvironmentProvider swaps
// in the matching mode's icon client-side once the persisted mode is known.
export default function Icon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img width={32} height={32} src={envIconDataUri(DEFAULT_MODE)} alt="" />
    ),
    { ...size }
  );
}
