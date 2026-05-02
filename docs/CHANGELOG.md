# EmulFast Changelog

> เก็บบันทึกการเปลี่ยนแปลงสำคัญหลังจบแต่ละ Phase. ฟอร์แมต: [Semantic Versioning](https://semver.org/) by phase

---

## [Phase 3] 2026-05-02 — User WebApp

### Added

**Backend**
- UsersModule — GET/PATCH `/users/me`, POST `/users/me/password` (argon2id + validation)
- 9 unit tests (user controller + service)

**Frontend**
- Landing page (hero + pricing + CTA)
- Auth pages (Login/Register + form validation + error handling)
- Dashboard (emulator list + status badge + countdown + WS notifications)
- Profile page (user info + password change)
- History page (rental/payment records + filter/sort)

**i18n**
- 6 namespaces ใหม่ TH+EN: `landing`, `auth_page`, `dashboard`, `notifications`, `profile`, `history`

**Infrastructure**
- Toast notification system + WS event handler (`emulator.status`, `emulator.expiring`)

### Fixed

- **ContainerService**: เพิ่ม `/dev/binder` device mount (Redroid boot fix)
- **ContainerService**: `scheduleAdbConnect` zombie app_process cleanup
- **ws-scrcpy Dockerfile**: python3, make, g++ build tools + entry point `dist/index.js`

### Tests

- 74 unit tests total (api: 62, orchestrator: 12)
- Lighthouse score: ≥80 (mobile), ≥95 (desktop)
- TypeCheck ✅ / ESLint ✅ / Build ✅

---

## [Phase 2] 2026-05-02 — Packages & Payment

### Added

**Backend**
- WalletModule — GET/PATCH `/wallets/me`, POST `/wallets/topup` (Fcoin balance)
- OrderModule — GET/POST `/orders`, GET `/orders/{id}`, PATCH `/orders/{id}/renew`
- PaymentModule — POST `/payments/stripe` (webhook + idempotency), Stripe adapter

**Frontend**
- `/packages` page (browse SFAST/MFAST with pricing)
- `/payment/success` page (order confirmation)
- `/orders` page (active rentals)
- `/wallet` page (Fcoin balance + topup form)
- `/emulators/create` page (package selection flow)

**i18n**
- 5 namespaces ใหม่ TH+EN: `packages`, `payment`, `orders`, `wallet`, `emulators`

### Fixed

- EmulatorService renewal logic (expiration + auto-delete)
- Tooling: eslint.config.mjs (orchestrator), .gitignore (tsbuildinfo cleanup)

### Tests

- 53 unit tests passing (api: 42, orchestrator: 11)

---

## [Phase 1] 2026-05-02 — Core Emulator

### Added

**Backend**
- EmulatorModule — GET/POST `/emulators`, GET `/emulators/{id}/stream`
- ContainerService (orchestrator) — Redroid container lifecycle + ADB connection pool
- WS scrcpy server (H.264 streaming)

**Frontend**
- Emulator viewer page + WebSocket stream handler

**DevOps**
- docker-compose orchestrator + ws-scrcpy services
- Smoke test script

### Fixed

- API `mapToResponse` response serialization
- Redroid device mounting + permission

---

## [Phase 0] 2026-05-01 — Foundation

### Added

- **Monorepo**: Turborepo + pnpm + 3 apps (api, web, orchestrator) + 3 packages (db, shared, ui)
- **Database**: PostgreSQL 16 + Prisma 5 + 14 models (User, Wallet, Order, Emulator, Container, etc.)
- **Backend**: NestJS 11 + Passport-JWT + BullMQ + Pino logger
- **Frontend**: Next.js 15 (App Router) + Tailwind v4 + shadcn/ui + next-intl (TH/EN)
- **Auth**: JWT + argon2id password hashing
- **CI**: GitHub Actions workflow (lint, typecheck, test, build)

### Fixed

- NODE_ENV build error (web app)
- Layout + not-found.tsx (middleware chain)
- .gitignore (Node modules, secrets, dist)

---

> ดู `docs/phases.md` สำหรับ checklist แต่ละ phase + status
