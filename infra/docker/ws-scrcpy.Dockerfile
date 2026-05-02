# ─── ws-scrcpy Dockerfile ──────────────────────────────────────────────────
# Source: https://github.com/NetrisTV/ws-scrcpy
# ทำหน้าที่: WebSocket server สำหรับ stream Android screen ผ่าน ADB → browser
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build ws-scrcpy from source
FROM node:20-alpine AS builder
WORKDIR /app

# Install git สำหรับ clone source
RUN apk add --no-cache git

# Clone official ws-scrcpy repo (latest master)
RUN git clone --depth 1 --branch master https://github.com/NetrisTV/ws-scrcpy.git .

# Install deps + build static web + server bundle
RUN npm ci && npm run dist

# Stage 2: Runtime (lean image)
FROM node:20-alpine
WORKDIR /app

# Install ADB — ต้องใช้เพื่อ connect ไปยัง Redroid containers บน emulfast-redroid network
RUN apk add --no-cache android-tools

# Copy built output จาก builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# ws-scrcpy serve ที่ port 8000 โดย default
EXPOSE 8000

# Healthcheck — ตรวจสอบว่า HTTP server พร้อมรับ connection
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8000 || exit 1

# NOTE: ถ้า dist/server/server.js ไม่มี (entry point เปลี่ยนใน future version)
# ให้แทนด้วย: CMD ["npx", "serve", "-s", "dist", "-l", "8000"]
CMD ["node", "dist/server/server.js"]
