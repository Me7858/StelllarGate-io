import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 14 uses webpack 5, which supports Web Workers natively via
  // new Worker(new URL('./...worker.ts', import.meta.url), { type: 'module' })
  // No extra config is needed for basic worker bundling.
  //
  // The setting below disables webpack's default "output.workerChunkLoading"
  // override that can break TS workers in some Next.js versions.
  webpack(config, { isServer }) {
    if (!isServer) {
      // Ensure worker chunks use the correct chunk loading mechanism
      config.output = {
        ...config.output,
        workerChunkLoading: false,
      };
    }
    return config;
  },
};

export default nextConfig;
