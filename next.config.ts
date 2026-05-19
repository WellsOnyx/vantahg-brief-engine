import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.anthropic.com https://*.sentry.io;",
  },
];

const demoHeaders = securityHeaders
  .filter((h) => h.key !== 'X-Frame-Options')
  .map((h) =>
    h.key === 'Content-Security-Policy'
      ? { ...h, value: h.value.replace("default-src 'self'", "default-src 'self'; frame-ancestors *") }
      : h,
  );

const nextConfig: NextConfig = {
  // Standalone output produces a self-contained /app/server.js + minimal
  // node_modules in .next/standalone. Required for the Fargate container
  // image to stay small (~150MB instead of ~800MB).
  // Vercel ignores this setting (their build pipeline uses its own
  // output mode) so it's safe to leave on for both deploy targets.
  output: 'standalone',

  // Prevent Next.js from trying to bundle these server-only packages.
  // They are heavy, have native / CJS-only code, or are only meant for
  // Node.js runtime (not Edge / client bundles). This fixes Vercel
  // build failures for pg, nodemailer, Dropbox Sign, AWS SDK, etc.
  serverExternalPackages: [
    'pg',
    'nodemailer',
    '@dropbox/sign',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],
  // Pin the trace root to this directory so the standalone bundle puts
  // server.js at the root of .next/standalone/ instead of nesting it
  // under the absolute path. Without this, builds inside a git worktree
  // (which Claude Code uses) emit server.js under .next/standalone/.claude/...
  // which breaks the Dockerfile COPY paths.
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: '/demo',
        headers: demoHeaders,
      },
      {
        source: '/((?!demo).*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in CI
  silent: !process.env.CI,

  // Disable source map upload when no auth token is set
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Wipe build artifacts that contain source maps
  widenClientFileUpload: true,

  // Source maps configuration
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
