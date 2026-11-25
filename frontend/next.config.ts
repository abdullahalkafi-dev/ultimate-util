import path from 'node:path';
import type { NextConfig } from 'next';

const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const config: NextConfig = {
  output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  outputFileTracingRoot: path.join(__dirname, '..'),
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      fs: { browser: './src/lib/empty-module.ts' },
      path: { browser: './src/lib/empty-module.ts' },
      crypto: { browser: './src/lib/empty-module.ts' },
    },
  },
  webpack(cfg, { isServer }) {
    if (!isServer) cfg.resolve.fallback = { ...cfg.resolve.fallback, fs: false, path: false, crypto: false };
    return cfg;
  },
  poweredByHeader: false,
  async rewrites() {
    // Same-origin API so login cookies work without CORS.
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

export default config;
