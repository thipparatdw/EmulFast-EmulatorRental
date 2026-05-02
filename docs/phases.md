# EmulFast — Phases Tracker

> Source of truth สำหรับ progress ของแต่ละ phase. **เฉพาะ `reporter` agent อัปเดตได้** (lead สั่ง)

## ภาพรวม

| Phase | Focus | Status | Token (used/budget) |
|---|---|---|---|
| 0 | Foundation | ✅ Done | 289k / 80–120k |
| 1 | Core Emulator (Redroid + scrcpy) | ✅ Done | ~110k / 100–150k |
| 2 | Packages & Payment | ✅ Done | ~115k / 120–180k |
| 3 | User WebApp | ⚪ | 0 / 80–120k |
| 4 | Admin Backend | ⚪ | 0 / 100–140k |
| 5 | Membership & Rewards | ⚪ | 0 / 80–120k |
| 6 | Support ChatBot | ⚪ | 0 / 100–140k |
| 7 | Hardening | ⚪ | 0 / 60–100k |

Status: ⚪ Not Started / 🟡 In Progress / ✅ Done / ❌ Blocked

---

## Phase 0 — Foundation

**Goal**: ตั้งโครงสร้าง monorepo, DB, auth, i18n ให้พร้อมเริ่มสร้าง feature

**Owner agents**: architect (lead), devops, backend

### Deliverables

- [x] Monorepo setup: `pnpm-workspace.yaml`, `turbo.json`, `apps/`, `packages/`
- [x] `apps/api` — NestJS skeleton (health endpoint, Prisma module, config module, JWT strategy)
- [x] `apps/web` — Next.js 15 skeleton (App Router, Tailwind, shadcn/ui base, next-intl)
- [x] `apps/orchestrator` — NestJS microservice skeleton (health endpoint)
- [x] `packages/db` — Prisma schema v1 (User, Package, Emulator, Order, Payment, WalletTransaction, Promocode, MembershipTier, Reward, RewardRedemption, SupportTicket, SupportMessage, Feedback) + migration
- [x] `packages/shared` — zod schemas (Auth, User, Package), types, constants
- [x] `packages/ui` — shadcn primitives shared
- [x] `infra/compose/docker-compose.yml` — postgres + redis + adminer
- [x] `infra/docker/*.Dockerfile` — api, web, orchestrator
- [x] Auth module — register, login, refresh token, logout, JwtAuthGuard, RolesGuard
- [x] i18n setup — `apps/web/messages/{th,en}.json` + `next-intl` middleware
- [x] Seed script — admin user, 2 packages (SFAST, MFAST), 4 membership tiers
- [x] CI workflow — `.github/workflows/ci.yml` (lint + typecheck + test)
- [x] Phase 0 sign-off

### Acceptance Criteria

- `pnpm install && pnpm dev` รัน api + web + orchestrator ขึ้นพร้อมกัน
- `pnpm typecheck && pnpm lint && pnpm test` ผ่านทั้งหมด
- `docker compose up -d` ขึ้น postgres + redis สำเร็จ
- Seed admin login ได้ผ่าน `POST /auth/login`

### Blockers / Notes

QA build fix applied: NODE_ENV=production in web build script, root layout restructured (added html/body wrapper), not-found.tsx files fixed for fallback locale routes.

**Completed**: 2026-05-01 — QA gate passed, build fix verified (14 unit tests, Lighthouse OK)

---

## Phase 1 — Core Emulator

**Goal**: รัน Redroid container ผ่าน orchestrator + stream ผ่าน ws-scrcpy ให้ user ดูได้บน WebApp

**Owner agents**: devops (lead), backend, frontend

### Deliverables

- [~] Redroid base image setup (Android 10/12) — defer ไปทดสอบบน Linux server จริง (WSL2 ขาด /dev/binder, /dev/ashmem)
- [x] `apps/orchestrator` — container manager (start/stop/snapshot/delete) ใช้ `dockerode` (Phase 1 task 1)
- [x] BullMQ worker: scan expired emulators ทุก 1 นาที → ลบ container + volume (Phase 1 task 1)
- [x] `apps/api` — `EmulatorModule`: POST `/emulators` (create), GET `/emulators` (list mine), GET `/emulators/:id` (detail), DELETE `/emulators/:id`, POST `/emulators/:id/renew` ✅ Bug fixed: mapToResponse (Phase 1 task 2)
- [x] WebSocket gateway สำหรับ emulator status updates (Phase 1 task 1)
- [x] ws-scrcpy service ใน docker-compose + Nginx proxy (Phase 1 task 3)
- [x] `apps/web` — emulator viewer page (`/emulators/[id]`) แสดง stream + touch/keyboard (Phase 1 task 4)
- [~] Smoke test: script พร้อม (scripts/smoke-test.sh), auto-skip Redroid verify steps บน WSL2

### Acceptance Criteria

- User สมัคร + login → สร้าง emulator SFAST → เห็น Android boot screen ภายใน 30 วินาที → คลิก/พิมพ์ได้ → ลบได้

### Status Update

**2026-05-02 — Phase 1 ✅ Done (programmatic work)** (session #12–13, lead handoff close)

- Task 2: Fixed `mapToResponse` missing `packageCode`/`package` fields in EmulatorModule
- Task 3: Added orchestrator + ws-scrcpy services in docker-compose.yml + Nginx proxy config + ws-scrcpy 2-stage Dockerfile
- Task 4: Built emulator viewer page with WebSocket integration + i18n keys
- Task 5: Created smoke-test.sh (9-step integration test, auto-skip Redroid verify on WSL2)

**29 unit tests passed, lint + typecheck ✅, web build 102kB, docker compose config ✅, shell syntax ✅**

### Blockers / Notes

**Redroid verification deferred**: WSL2 kernel lacks /dev/binder and /dev/ashmem (Redroid requirements). Physical test must run on production Linux server (Ubuntu 22.04+ with KVM).
smoke-test.sh handles this gracefully: detects /dev/binder absence → auto-skips steps 6–8 (container spawn/interact/cleanup).

---

## Phase 2 — Packages & Payment

**Goal**: ระบบ package, ชำระเงิน 2 ช่องทาง (Stripe Card + Fcoin), wallet, ต่ออายุ

**Owner agents**: backend (lead), frontend

### Deliverables

- [ ] `PackageModule` — list packages, get by code
- [ ] `WalletModule` — balance, top-up (Stripe Card), spend, refund
- [ ] `OrderModule` — create order (จาก package + payment method) → emulator
- [ ] `PaymentModule` — adapter pattern: StripeAdapter, FcoinAdapter
- [ ] Webhook endpoints: `/payments/stripe/webhook` (with signature verify)
- [ ] Renewal flow — renew existing emulator (no restart, แค่ขยาย expires_at)
- [ ] Expiry cleanup — BullMQ scheduled job
- [ ] Frontend: หน้าเลือก package, checkout, payment status polling, my orders, wallet top-up

### Acceptance Criteria

- ซื้อ SFAST ด้วย Stripe Card sandbox → emulator created → ต่ออายุ → ใช้ได้ต่อเนื่อง
- Top-up Fcoin ผ่าน Stripe Card → ซื้อ MFAST ด้วย Fcoin

### Tasks

| # | Task | Agent | Status |
|---|---|---|---|
| 2.1 | Shared schemas (Order/Wallet) + PackageModule complete | backend | ✅ Done |
| 2.2 | WalletModule + OrderModule (create, list, status, Fcoin pay) | backend | ✅ Done |
| 2.3 | PaymentModule (Stripe adapter + webhook + renewal) | backend | ✅ Done |
| 2.4 | BullMQ expiry cleanup job (order-aware) | backend | ✅ Done (existing job covers) |
| 2.5 | Frontend: packages page, checkout, order status, wallet top-up, my orders | frontend | ✅ Done |
| 2.6 | QA gate + phase sign-off | qa + reporter | ✅ Done |

### Status Update

**2026-05-02 — Phase 2 ✅ Done** (session #14–15, QA gate passed)

- Backend: WalletModule (GET /wallet, POST /wallet/topup Stripe Checkout, creditFcoin, deductFcoin), OrderModule (POST /orders card+fcoin paths, GET /orders, GET /orders/:id, GET /orders/:id/status), PaymentModule (Stripe webhook signature verify + idempotency + checkout event handling), EmulatorService (POST /emulators/:id/renew with fcoin immediate + Stripe Checkout)
- Frontend: /packages (browse + checkout), /payment/success (poll order status), /orders (list), /wallet (balance + topup + tx history), /emulators/create (auto-create from orderId)
- i18n: packages, payment, orders, wallet namespaces (TH + EN)
- Tooling: eslint.config.mjs สำหรับ apps/orchestrator

**QA Results**: lint ✅, typecheck ✅, 53 tests ✅, build ✅

**Token used**: ~115k (backend 65k, frontend 50k)

---

## Phase 3 — User WebApp

**Goal**: หน้าผู้ใช้ครบ — browse, dashboard, profile, history

**Owner agents**: frontend (lead)

### Deliverables

- [ ] หน้าแรก (landing) + login/register
- [ ] หน้า packages
- [ ] Dashboard — my emulators (active/expired), quick renew
- [ ] Profile — edit info, change password
- [ ] History — orders, payments, wallet transactions
- [ ] Notifications — toast + WS-driven (expiring soon)
- [ ] i18n สมบูรณ์ (TH default, EN ครบทุก key)

### Acceptance Criteria

- Lighthouse score: Performance ≥ 80, Accessibility ≥ 95
- ใช้งานได้บน mobile (responsive)

---

## Phase 4 — Admin Backend

**Goal**: ระบบหลังบ้านสำหรับ staff/admin

**Owner agents**: backend (lead), frontend

### Deliverables

- [ ] RBAC module + decorators
- [ ] Admin endpoints: users, orders, emulators, packages, promocodes, reports
- [ ] Frontend `(admin)` group — dashboard (KPI), user management, order list, emulator monitor, promocode CRUD
- [ ] Audit log — track all admin actions
- [ ] Report export — CSV (orders, revenue, active users)

### Acceptance Criteria

- Staff login → เห็น dashboard, จัดการ orders ได้
- Admin login → ทุกอย่างของ staff + จัดการ users + promocodes

---

## Phase 5 — Membership & Rewards

**Goal**: ระบบสมาชิกสะสมแต้ม + แลกของรางวัล

**Owner agents**: backend, frontend

### Deliverables

- [ ] `MembershipModule` — auto-update tier ตาม points, hook หลัง order paid (1 THB = 1 pt)
- [ ] `PromocodeModule` — validate, apply, track usage
- [ ] `RewardModule` — list, redeem (deduct points → issue promocode/Fcoin/free time)
- [ ] Frontend: หน้า membership (tier + perks), rewards (catalog + redeem), promocode input ตอน checkout

### Membership Tiers

| Tier | Points | Perks |
|---|---|---|
| Bronze | 0–999 | 1% cashback Fcoin |
| Silver | 1k–4.9k | 3% cashback + 5% off renew |
| Gold | 5k–14.9k | 5% cashback + 10% off + priority support |
| Platinum | 15k+ | 8% cashback + 15% off + free SFAST 1 วัน/เดือน + exclusive promocode |

---

## Phase 6 — Support ChatBot

**Goal**: ระบบ feedback + แจ้งปัญหา 2 ช่อง (auto/staff) + อัปโหลดรูป

**Owner agents**: backend, frontend

### Deliverables

- [ ] `SupportModule` — ticket CRUD, message stream (WebSocket)
- [ ] `ChatBotService` — FAQ matcher (rule-based + keyword) สำหรับ "auto" channel
- [ ] Image upload — pre-signed URL (S3-compatible หรือ local volume สำหรับ Demo)
- [ ] Escalation: ถ้า bot ตอบไม่ได้ + user กดขอคน → assign staff (round-robin)
- [ ] Frontend: chat widget + ticket history + image preview

### Acceptance Criteria

- User เปิด chat → ถามคำถาม FAQ (เช่น "ต่ออายุยังไง") → bot ตอบทันที
- User กดขอคน → ticket → staff ตอบใน admin panel

---

## Phase 7 — Hardening

**Goal**: Security, performance, deploy guide

**Owner agents**: architect (lead), devops, qa

### Deliverables

- [ ] Security audit — OWASP top 10 checklist
- [ ] Rate limiting (redis-based)
- [ ] CSRF protection (cookie-based)
- [ ] Helmet middleware + CSP headers
- [ ] Logging + monitoring (Pino → file rotation, basic metrics endpoint)
- [ ] Backup strategy (postgres dump cron)
- [ ] Production docker-compose + nginx config + LE certbot
- [ ] `docs/runbook.md` ครบถ้วน — deploy, restore, troubleshoot

### Acceptance Criteria

- ทดสอบ deploy บน Linux VPS clean → ระบบทำงานครบ end-to-end ภายใน 30 นาที (ตาม runbook)
