# ============================================================
# Stage 1: base — ติดตั้ง pnpm + docker CLI (สำหรับ healthcheck)
# ============================================================
FROM node:20-alpine AS base

# ติดตั้ง docker CLI สำหรับ debug (orchestrator ใช้ dockerode ผ่าน socket)
RUN apk add --no-cache docker-cli \
  && corepack enable && corepack prepare pnpm@9.12.3 --activate
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

# ============================================================
# Stage 2: deps — ติดตั้ง dependencies
# ============================================================
FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/orchestrator/package.json ./apps/orchestrator/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter orchestrator... --prod=false

# ============================================================
# Stage 3: builder — build orchestrator
# ============================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/orchestrator/node_modules ./apps/orchestrator/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY tsconfig.base.json ./
COPY apps/orchestrator ./apps/orchestrator/
COPY packages/shared ./packages/shared/

RUN pnpm --filter shared build
RUN pnpm --filter orchestrator build

# ============================================================
# Stage 4: runner — production image
# ============================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache docker-cli \
  && corepack enable && corepack prepare pnpm@9.12.3 --activate \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 orchestrator \
  # เพิ่ม orchestrator user เข้า docker group (เพื่อเข้า socket)
  && addgroup --system docker || true \
  && adduser orchestrator docker || true

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/orchestrator/package.json ./apps/orchestrator/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter orchestrator... --prod

COPY --from=builder --chown=orchestrator:nodejs /app/apps/orchestrator/dist ./apps/orchestrator/dist/
COPY --from=builder --chown=orchestrator:nodejs /app/packages/shared/dist ./packages/shared/dist/

USER orchestrator

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "apps/orchestrator/dist/main.js"]
