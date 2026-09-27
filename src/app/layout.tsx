import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StoreHydrator } from "../components/StoreHydrator";
import { BackendDataProvider } from "../lib/context/BackendDataContext";
import { SpotFeedProvider } from "../lib/context/SpotFeedContext";
import { NetworkMismatchBanner } from "../components/NetworkMismatchBanner";

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
  title: "Zenith | On-chain Options on Stellar",
  description:
    "Buy and write European put and call options on XLM, BTC, ETH, and SOL. The first decentralized options protocol on Stellar Soroban.",
  keywords: ["options", "calls", "puts", "derivatives", "stellar", "soroban", "defi", "black-scholes"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${jetbrainsMono.variable}`}>
      <body>
        <StoreHydrator />
        <SpotFeedProvider>
          <BackendDataProvider>
            <NetworkMismatchBanner />
            {children}
          </BackendDataProvider>
        </SpotFeedProvider>
      </body>
    </html>
  );
}
