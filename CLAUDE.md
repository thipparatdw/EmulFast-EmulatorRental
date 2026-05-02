# CLAUDE.md — EmulFast Project Memory

> ไฟล์นี้ถูกอ่านอัตโนมัติทุก session ของ Claude Code. **เก็บให้สั้น (<200 บรรทัด)** และอัปเดตเฉพาะส่วน "Current State" หลังจบทุก phase

## โปรเจกต์

**EmulFast (Demo)** — WebApp ให้บริการเช่า Android Emulator (Cloud Phone) คล้าย LDCloud / UGPhone

- **Goal Demo**: ระบบใช้งานได้จริง, function พื้นฐานครบ, deploy บน Linux server เดี่ยว
- **Languages**: TH + EN (i18n)
- **Primary communication**: ภาษาไทย (เทคนิค EN ได้)

## Tech Stack (Locked)

- **Frontend**: Next.js 15 (App Router) + Tailwind v4 + shadcn/ui + next-intl + react-hook-form + zod + SWR
- **Backend**: NestJS 11 + Prisma + zod + passport-jwt + BullMQ
- **DB**: PostgreSQL 16 / **Cache+Queue**: Redis 7
- **Emulator**: Redroid (Docker) + ws-scrcpy (WebSocket H.264 streaming)
- **Orchestrator**: NestJS microservice (`apps/orchestrator/`) ใช้ `dockerode`
- **Payment**: Stripe (Card) + Fcoin (internal wallet)
- **Repo**: pnpm + Turborepo monorepo
- **Deploy**: Docker Compose, Nginx, Linux (Ubuntu 22.04+ with KVM)

## Packages (Demo)

| Code | Android | CPU | RAM | ROM |
|---|---|---|---|---|
| **SFAST** | 10 | 3 cores | 3 GB | 30 GB |
| **MFAST** | 10 หรือ 12 | 3 cores | 4 GB | 64 GB |

## Phases

ดู `docs/phases.md` (source of truth). โดยรวม:

0. Foundation (monorepo, DB, auth, i18n)
1. Core Emulator (Redroid + scrcpy + session API)
2. Packages & Payment (SFAST/MFAST, Fcoin, Stripe/Card, renewal)
3. User WebApp (browse, dashboard, my emulators)
4. Admin Backend (RBAC, dashboard, user/order mgmt)
5. Membership & Rewards (tier, points, promocode)
6. Support ChatBot (auto FAQ + staff handoff + image upload)
7. Hardening (security, performance, deploy guide)

## AI Agent Workflow

ดู `AGENTS.md` (relationship diagram + escalation rules)

**กฎสำคัญ**:
- ทุก request ของ User เข้าทาง `lead` agent ก่อนเสมอ
- `backend` ↔ `frontend` ห้ามคุยตรง — ต้องผ่าน `lead`
- ทุก task ต้องผ่าน `qa` gate ก่อนส่ง User
- `architect` (Opus) เรียกเฉพาะตอน design ใหม่ / blocker จริง — ใช้ Token แพง

## Conventions

- **Money**: ใช้ `Prisma.Decimal` ห้ามแปลงเป็น `Number`
- **Time**: เก็บ UTC ใน DB, แสดง Asia/Bangkok ใน UI
- **i18n keys**: namespaced (`auth.login.title`) — ห้าม hardcode user-facing text
- **Validation**: zod schemas ใน `packages/shared/`, ใช้ทั้ง backend + frontend
- **Errors**: NestJS exceptions เท่านั้น — ห้าม `throw new Error()`
- **Logging**: Pino (backend), `console.error` ห้ามใช้ใน production code
- **Tests**: Jest unit test สำหรับ service layer, e2e smoke สำหรับ critical flows

## Environment Variables (template)

```env
# apps/api
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
STRIPE_SECRET_KEY=...
ORCHESTRATOR_URL=http://orchestrator:5000
ORCHESTRATOR_TOKEN=...

# apps/web
NEXT_PUBLIC_API_URL=...
NEXT_PUBLIC_WS_URL=...

# apps/orchestrator
DOCKER_HOST=unix:///var/run/docker.sock
REDROID_NETWORK=emulfast-redroid
ADB_PORT_RANGE=5555-5655
```

## Repository Layout

```
apps/        web/ api/ orchestrator/
packages/    db/ shared/ ui/
infra/       docker/ compose/ nginx/
docs/        architecture.md phases.md api-contract.md token-budget.md runbook.md
.claude/     agents/ commands/ settings.local.json
```

## Current State

> **Last updated**: 2026-05-02
>
> **Active Phase**: Phase 2 ✅ Done — Phase 3 รอเริ่ม
>
> **Phase 2 summary**: WalletModule, OrderModule, PaymentModule (Stripe webhook + idempotency), EmulatorService renewal ครบ. Frontend: /packages, /payment/success, /orders, /wallet, /emulators/create. i18n (packages/payment/orders/wallet) TH+EN. QA: 53 tests ✅, lint+typecheck+build ✅.
>
> **Next action**: รอสั่ง `/plan-phase 3` เพื่อเริ่ม Phase 3 (User WebApp)

## ห้ามทำ (Hard Rules)

- ❌ ห้าม commit secret / .env เข้า git
- ❌ ห้ามแก้ schema.prisma โดย agent อื่นนอกจาก `architect`
- ❌ ห้าม push ไปยัง remote โดยอัตโนมัติ — User เป็นคนสั่งเอง
- ❌ ห้ามรัน `docker system prune`, `rm -rf`, หรือคำสั่งทำลายข้อมูล
- ❌ ห้ามข้าม `qa` gate ก่อนส่ง User
- ❌ ห้าม subagent คุยข้าม role โดยไม่ผ่าน Lead

## Token Budget (เป้าหมาย Demo)

- Phase 0–7 รวม ~720k–1,070k tokens
- Lead/Reporter ต้องรายงานทุก handoff (ดู `docs/token-budget.md`)
- ถ้าใช้เกิน 80% ของ budget phase → Lead แจ้ง User

---

> เมื่อมี doubt ให้ดู: `AGENTS.md` (workflow), `docs/architecture.md` (design), `docs/api-contract.md` (API), `docs/phases.md` (progress)
