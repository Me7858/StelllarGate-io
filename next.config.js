/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Environment-aware configuration
  env: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT || 'production',
    NEXT_PUBLIC_IS_PREVIEW: process.env.NEXT_PUBLIC_IS_PREVIEW || 'false',
    NEXT_PUBLIC_PR_NUMBER: process.env.NEXT_PUBLIC_PR_NUMBER || '',
    NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA || '',
  },

  // Headers for robots.txt on preview deployments
  async headers() {
    const headers = [];

    // Add noindex robots header for preview deployments
    if (process.env.NEXT_PUBLIC_IS_PREVIEW === 'true') {
      headers.push({
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      });
    }

    return headers;
  },

  // Redirects configuration
  async redirects() {
    return [];
  },

  // Rewrites configuration
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },
};

module.exports = nextConfig;
