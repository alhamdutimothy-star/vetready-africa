import type { NextConfig } from 'next';
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { cpus: 2 },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
};
export default config;
