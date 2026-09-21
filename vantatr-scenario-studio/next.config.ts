import type { NextConfig } from "next";

// Served under vantatr.com/studio: a rewrite on the marketing project proxies
// /studio → this deployment, and basePath makes every asset + link resolve
// under that prefix so the proxied paths line up. Set NEXT_PUBLIC_BASE_PATH=""
// at build time for a bare root deploy (e.g. studio.vantatr.com) — an empty
// value drops the prefix entirely (Next rejects basePath: "").
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH === undefined
    ? "/studio"
    : process.env.NEXT_PUBLIC_BASE_PATH;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fully static demo — no backend, API routes, or dynamic rendering.
  // `export` emits a self-contained static site to `out/` that can be served
  // from any static host (Vercel, etc.) without a Node runtime.
  output: "export",
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
