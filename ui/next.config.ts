import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/chat',
        destination: 'http://localhost:8000/chat',
      },
      {
        source: '/healthz',
        destination: 'http://localhost:8000/healthz',
      },
    ];
  },
};

export default nextConfig;
