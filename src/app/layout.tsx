import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StoreHydrator } from "../components/StoreHydrator";
import { BackendDataProvider } from "../lib/context/BackendDataContext";
import { SpotFeedProvider } from "../lib/context/SpotFeedContext";
import { FlagsProvider } from "../lib/flags/FlagsContext";
import { FlagsDevPanel } from "../lib/flags/FlagsDevPanel";
import { fetchRemoteConfig } from "../lib/flags/fetchRemoteConfig";
import { resolveAllFlags } from "../lib/flags/resolve";

const fraunces = Fraunces({
  subsets: ["latin"], weight: ["400","500","600","700"],
  variable: "--font-fraunces", display: "swap",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"], weight: ["400","500","600","700"],
  variable: "--font-plex-sans", display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"], weight: ["400","500","600","700"],
  variable: "--font-jetbrains-mono", display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for OG/Twitter image URLs (e.g. /share/[id] cards).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Zenith | On-chain Options on Stellar",
  description:
    "Buy and write European put and call options on XLM, BTC, ETH, and SOL. The first decentralized options protocol on Stellar Soroban.",
  keywords: ["options", "calls", "puts", "derivatives", "stellar", "soroban", "defi", "black-scholes"],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Fetch remote config on the server so the first client render has the
  // correct values — no flicker, no layout shift.
  const remoteConfig = await fetchRemoteConfig();

  // Resolve initial flag values server-side (no wallet context available
  // here, so only network-agnostic defaults + remote overrides apply).
  const initialFlags = resolveAllFlags({ remoteConfig });

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${jetbrainsMono.variable}`}>
      <body>
        <StoreHydrator />
        <FlagsProvider initialFlags={initialFlags} initialRemoteConfig={remoteConfig}>
          <SpotFeedProvider>
            <BackendDataProvider>{children}</BackendDataProvider>
          </SpotFeedProvider>
          {/* Dev panel — tree-shaken in production */}
          {isDev && <FlagsDevPanel />}
        </FlagsProvider>
      </body>
    </html>
  );
}
