/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

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
  },
};

module.exports = nextConfig;
