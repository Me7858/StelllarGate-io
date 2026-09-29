const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // Next.js 15: fetch is no longer cached by default (changed from force-cache
  // to no-store). The app uses the client-side fetch wrapper in
  // src/lib/api/client.ts which always runs in the browser, so this doesn't
  // affect existing behaviour — but new server components should opt-in to
  // caching explicitly rather than relying on defaults.
  //
  // Reference: https://nextjs.org/docs/app/building-your-application/caching

  // Expose a small set of build-time defaults that can be overridden at
  // runtime via /api/runtime-config.  Any NEXT_PUBLIC_* var baked in here
  // is just a fallback; the client SDK always fetches the live values first.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081",
  },

  // Tell webpack/Next to tree-shake named exports instead of pulling in
  // the whole package barrel for these dependencies.  This cuts the initial
  // JS shipped to the browser for packages that export a large default
  // object (e.g. @stellar/freighter-api).
  experimental: {
    optimizePackageImports: ["@stellar/freighter-api"],
  },

  webpack: (config, { isServer }) => {
    // @stellar/stellar-sdk pulls in sodium-native (a Node.js native addon)
    // for Ed25519 signing in server environments. It's not needed in the
    // browser — the SDK falls back to WebCrypto/TweetNaCl automatically.
    // Marking it as external (server) and false (client) suppresses the
    // "critical dependency" bundler warnings without breaking anything.
    if (isServer) {
      config.externals = [...(config.externals ?? []), "sodium-native"];
    } else {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        "sodium-native": false,
      };
    }
    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Sentry organisation + project (set in CI env / .env.local)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps in CI and suppress them from the public bundle.
  // Source maps are uploaded once during `next build` and then deleted
  // from the build artefacts before the image is pushed (see Dockerfile).
  silent: true,
  hideSourceMaps: true,

  // Disable the Sentry SDK size check warning — we load integrations
  // lazily, so the per-page overhead is minimal.
  disableLogger: true,

  // Tunnel Sentry requests through /api/sentry-tunnel to work around
  // ad-blockers that block sentry.io.
  tunnelRoute: "/api/sentry-tunnel",

  // Don't wrap every API route automatically — we instrument key spans
  // manually in src/lib/monitoring.ts.
  autoInstrumentServerFunctions: false,
  autoInstrumentMiddleware: false,
});
