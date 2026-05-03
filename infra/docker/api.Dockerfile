# ============================================================
# Stage 1: base — ติดตั้ง pnpm และ turbo
# ============================================================
FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

# ============================================================
# Stage 2: deps — ติดตั้ง dependencies ทั้งหมด (with lockfile)
# ============================================================
FROM base AS deps

# Copy workspace manifests และ lockfile ก่อน (leverage cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# Frozen install — ห้าม update lockfile ใน build
RUN pnpm install --frozen-lockfile --filter api... --prod=false

# ============================================================
# Stage 3: builder — build api
# ============================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY apps/api ./apps/api/
COPY packages/db ./packages/db/
COPY packages/shared ./packages/shared/

# Generate Prisma client
RUN pnpm --filter db generate

# Build
RUN pnpm --filter api build

# ============================================================
# Stage 4: runner — production image (minimal)
# ============================================================
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copy workspace manifests (needed for pnpm workspaces at runtime)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# Install production deps only
RUN pnpm install --frozen-lockfile --filter api... --prod

# Copy built artifacts
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist/
COPY --from=builder --chown=nestjs:nodejs /app/packages/db/dist ./packages/db/dist/
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist/

# Copy Prisma schema for migrations
COPY --from=builder --chown=nestjs:nodejs /app/packages/db/prisma ./packages/db/prisma/

USER nestjs

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
