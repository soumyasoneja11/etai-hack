# ---------------------------------------------------------------------------
# Multi-stage Next.js build producing a minimal standalone runtime image.
# Requires `output: "standalone"` in next.config.ts.
# ---------------------------------------------------------------------------

# 1. Install dependencies (cached unless the lockfile changes).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Build. NEXT_PUBLIC_* vars are inlined at build time, so they must be
#    supplied as build args here (not at runtime).
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Mock mode MUST be explicitly false for a production build (next.config.ts
# fails the build otherwise). API base + Supabase (anon) are baked in.
ARG NEXT_PUBLIC_USE_MOCK_API=false
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_USE_MOCK_API=$NEXT_PUBLIC_USE_MOCK_API \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# 3. Runtime — copy only the standalone server + static assets.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# server.js is produced by the standalone build. Supabase server-side vars
# (SUPABASE_URL / SUPABASE_ANON_KEY) used by /api/auth/* are read at runtime.
CMD ["node", "server.js"]
