import type { NextConfig } from "next";

/** The Python FastAPI backend (backend/). Start it with `npm run dev:backend`. */
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8010";

const nextConfig: NextConfig = {
  experimental: {
    // Generating an episode or defense questions can take over a minute; the default proxy timeout is 30s.
    proxyTimeout: 180_000,
  },
  // Forward API calls and generated audio to the Python backend, so the browser
  // only ever talks to this app (no CORS, same URLs in development and production).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The service worker must never be cached, so updates reach users straight away.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/media/:path*", destination: `${BACKEND_URL}/media/:path*` },
    ];
  },
};

export default nextConfig;
