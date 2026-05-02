# EmulFast — Architecture

> Source of truth สำหรับ system design. **เฉพาะ `architect` agent อัปเดตได้** (lead สั่ง)

## ภาพรวมระบบ

```mermaid
flowchart LR
    User([User Browser]) -->|HTTPS| Nginx[Nginx<br/>reverse proxy]
    Nginx -->|/| Web[Next.js<br/>apps/web :3000]
    Nginx -->|/api| API[NestJS<br/>apps/api :4000]
    Nginx -->|/ws/scrcpy| ScrcpyWS[ws-scrcpy :8000]

    Web -->|fetch| API
    API -->|Prisma| DB[(PostgreSQL 16)]
    API -->|BullMQ| Redis[(Redis 7)]
    API -->|HTTP internal| Orch[Orchestrator<br/>apps/orchestrator :5000]
    Orch -->|dockerode| Docker[Docker Engine]
    Docker -.->|spawn| Redroid[Redroid<br/>Container x N]
    ScrcpyWS -.->|ADB| Redroid

    API -->|webhook| StripeAPI[Stripe API]
    API -->|webhook| OmiseAPI[Omise API]
```

## Service Boundaries

### `apps/web` — Next.js 15 (App Router)
- Public + authenticated user pages + admin dashboard (route group)
- i18n (TH/EN) ผ่าน `next-intl` middleware
- Server components default; client components เฉพาะ interactive (forms, viewer, charts)
- ใช้ shadcn/ui + Tailwind

### `apps/api` — NestJS 11
- REST endpoints + WebSocket gateway
- Modules: Auth, User, Package, Emulator, Order, Payment, Wallet, Promocode, Membership, Reward, Support, Feedback, Admin
- Validation ด้วย zod ผ่าน `ZodValidationPipe`
- Auth: JWT (access 15min) + Refresh token (7 days, httpOnly cookie)
- Background jobs: BullMQ (renewal scan, payment retry, support FAQ index)

### `apps/orchestrator` — NestJS microservice
- เรียก Docker API ผ่าน `dockerode` socket
- Internal API only (network policy block external)
- Endpoints: `/containers` (CRUD), `/health`
- Token-protected (`ORCHESTRATOR_TOKEN`)

### `packages/db` — Prisma
- `schema.prisma` (single source of truth สำหรับ data model)
- Migrations + seed
- Generated client export ผ่าน `@emulfast/db`

### `packages/shared` — TypeScript types + zod schemas
- ใช้ทั้ง api + web (validation symmetric)
- DTO definitions, enum constants, error codes, i18n keys

### `packages/ui` — Shared React components
- shadcn primitives ที่ extend แล้ว
- ใช้ใน `apps/web` (อาจไม่จำเป็นสำหรับ Demo — รวมใน apps/web/components ก็ได้)

## Data Flow ตัวอย่าง

### สร้าง Emulator (Phase 1)

```mermaid
sequenceDiagram
    actor User
    participant Web as apps/web
    participant API as apps/api
    participant Orch as orchestrator
    participant Docker
    participant Redroid

    User->>Web: เลือก SFAST + Buy
    Web->>API: POST /orders {packageCode, paymentMethod}
    API->>API: deduct wallet OR create payment intent
    API-->>Web: { orderId, status: 'paid' }
    Web->>API: POST /emulators { orderId }
    API->>Orch: POST /containers { userId, packageCode }
    Orch->>Docker: dockerode.create(redroid:10, --memory=3g, --cpus=3, ...)
    Docker->>Redroid: start
    Redroid-->>Docker: ready (after ~20s)
    Orch-->>API: { containerId, adbPort, websocketUrl }
    API-->>Web: { emulatorId, websocketUrl }
    Web->>Web: navigate to /emulators/[id]
    Web->>Redroid: WebSocket via /ws/scrcpy/[id]
    Redroid-->>Web: H.264 video frames
    User->>Web: touch/keyboard
    Web->>Redroid: input events
```

### ชำระเงินผ่าน PromptPay (Phase 2)

```mermaid
sequenceDiagram
    actor User
    participant Web
    participant API
    participant Omise
    User->>Web: เลือก MFAST + PromptPay
    Web->>API: POST /orders { packageCode: 'MFAST', paymentMethod: 'promptpay' }
    API->>Omise: createCharge(amount, type=promptpay)
    Omise-->>API: { qrCodeUrl, chargeId, expires_at }
    API-->>Web: { orderId, qrCodeUrl, expires_at }
    Web->>User: แสดง QR
    User->>Bank: scan + pay
    Bank->>Omise: settlement
    Omise->>API: webhook /payments/omise/webhook
    API->>API: verify signature, update order = paid
    API->>API: trigger emulator creation
    Web->>API: GET /orders/:id/status (polling)
    API-->>Web: { status: 'paid', emulatorId }
```

## Data Model (สรุป — schema เต็มอยู่ใน Phase 0)

```mermaid
erDiagram
    User ||--o{ Emulator : owns
    User ||--o{ Order : places
    User ||--|| Wallet : has
    User ||--o{ WalletTransaction : has
    User }o--|| MembershipTier : tiered
    User ||--o{ RewardRedemption : redeems
    User ||--o{ SupportTicket : creates
    Order ||--o| Payment : pays
    Order }o--|| Package : buys
    Order ||--o| Emulator : creates
    Order }o--o| Promocode : applies
    Reward ||--o{ RewardRedemption : redeemed
    SupportTicket ||--o{ SupportMessage : contains
```

ตารางหลัก: `User`, `Package`, `Emulator`, `Order`, `Payment`, `Wallet`, `WalletTransaction`, `Promocode`, `MembershipTier`, `Reward`, `RewardRedemption`, `SupportTicket`, `SupportMessage`, `Feedback`

## Security

- **Auth**: JWT access (15min) + Refresh (httpOnly + Secure + SameSite=Lax cookie)
- **RBAC**: roles `user | staff | admin` enforced ผ่าน `RolesGuard`
- **CSRF**: double-submit cookie pattern
- **Rate limit**: `@nestjs/throttler` + Redis store (10 req/sec/IP global, stricter ที่ /auth/*)
- **Input**: zod validation, SQL via Prisma (no raw)
- **Money**: Decimal everywhere, transaction-wrapped ทุก wallet operation
- **Webhook**: HMAC signature verify (Stripe + Omise)
- **Container isolation**: Redroid containers แยก network, no egress ไป internal services
- **Secrets**: ผ่าน env vars only, ไม่ commit เข้า git

## Deployment (Demo)

- **Host**: Ubuntu 22.04+ VPS (4 vCPU, 16GB RAM, 200GB SSD ขั้นต่ำ — รองรับ 2-4 emulator พร้อมกัน)
- **KVM**: ต้อง enabled (`/dev/kvm` accessible)
- **Docker**: 24+, docker compose v2
- **Reverse proxy**: Nginx + Let's Encrypt
- **DB backup**: cron `pg_dump` รายวัน → store local + S3 (optional)

## Performance Targets (Demo)

- Boot Redroid → ready: ≤ 30s
- WebSocket latency (input → frame): ≤ 250ms (LAN test)
- API p95 latency: ≤ 200ms (ยกเว้น webhook + emulator create)
- Concurrent emulators per host: 4 (Demo) — 8+ ในอนาคต

## ADRs

ดู `docs/adr/` (architect เพิ่มเมื่อมี decision สำคัญ)

_(ยังไม่มี ADR ใน skeleton นี้ — architect จะสร้างใน Phase 0)_
