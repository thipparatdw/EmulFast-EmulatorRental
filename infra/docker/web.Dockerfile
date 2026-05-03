# ============================================================
# Stage 1: base — ติดตั้ง pnpm
# ============================================================
FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

# ============================================================
# Stage 2: deps — ติดตั้ง dependencies
# ============================================================
FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --filter web... --prod=false

# ============================================================
# Stage 3: builder — next build
# ============================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules

COPY tsconfig.base.json ./
COPY apps/web ./apps/web/
COPY packages/shared ./packages/shared/
COPY packages/ui ./packages/ui/

# Build shared/ui packages first
RUN pnpm --filter shared build
RUN pnpm --filter ui build

# Next.js build — output: standalone
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ============================================================
# Stage 4: runner — standalone Next.js server
# ============================================================
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static/
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public/

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
