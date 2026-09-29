# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Zenith Frontend — multi-stage Dockerfile
#
# Stages
#   deps      — install production + dev dependencies (cached layer)
#   builder   — next build (standalone output)
#   runner    — minimal Alpine runtime image
#
# Runtime environment variables (set these at container start, not build time):
#   NEXT_PUBLIC_API_URL        e.g. https://api.zenith.finance
#   NEXT_PUBLIC_RPC_URL        e.g. https://soroban-mainnet.stellar.org
#   NEXT_PUBLIC_NETWORK        mainnet | testnet
#   NEXT_PUBLIC_CONTRACT_ID    Soroban contract ID
#
# Build args (rarely needed — only for custom registry mirrors, etc.):
#   NODE_VERSION   defaults to 20-alpine
# ---------------------------------------------------------------------------

ARG NODE_VERSION=20-alpine

# ── Stage 1: install dependencies ──────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

# Copy lockfile first so Docker cache is invalidated only when deps change.
COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts


# ── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Bring in installed node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source.
COPY . .

# Build-time placeholders — real values are injected via /api/runtime-config
# at container start, but Next.js requires these to be non-empty at build
# time for NEXT_PUBLIC_ vars referenced in server components.
ARG NEXT_PUBLIC_API_URL=http://localhost:8081
ARG NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
ARG NEXT_PUBLIC_NETWORK=testnet
ARG NEXT_PUBLIC_CONTRACT_ID=

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_RPC_URL=${NEXT_PUBLIC_RPC_URL} \
    NEXT_PUBLIC_NETWORK=${NEXT_PUBLIC_NETWORK} \
    NEXT_PUBLIC_CONTRACT_ID=${NEXT_PUBLIC_CONTRACT_ID} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ── Stage 3: minimal runtime ────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Create a non-root user for security.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy only the standalone output and static assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public 2>/dev/null || true

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
