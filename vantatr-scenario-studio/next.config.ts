import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fully static demo — no backend, API routes, or dynamic rendering.
  // `export` emits a self-contained static site to `out/` that can be served
  // from any static host (Vercel, etc.) without a Node runtime.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
