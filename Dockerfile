# Multi-stage Docker build for the VantaUM Next.js app.
#
# Three stages:
#   1. deps    - install production dependencies
#   2. builder - build the Next.js standalone output
#   3. runner  - minimal runtime image
#
# Final image is ~150MB. Targets the AWS Fargate task that runs behind
# the ALB at app.vantaum.com. The marketing site stays on Vercel and
# is NOT served from this container.

# ── Stage 1: dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
# libc6-compat is required by some Next.js internals on Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy only the package manifest files first so this layer caches when
# only source code changes.
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env: telemetry off (we don't ship telemetry to Vercel from
# AWS) and a stable build id for the standalone bundle.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as non-root for the security audit.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy the standalone bundle, the public assets, and the built static files.
# Standalone mode already includes only the deps that next/server actually
# resolved, so we don't copy node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# server.js is the entrypoint produced by `next build` in standalone mode.
CMD ["node", "server.js"]
