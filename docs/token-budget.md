# EmulFast — Token Budget Tracker

> Reporter agent อัปเดตทุกครั้งหลัง handoff. ตัวเลขเป็นค่าประมาณ (จาก context size + estimation ของ Claude Code)

## Budget แต่ละ Phase

| Phase | Focus | Budget | Used | Remaining | Status |
|---|---|---|---|---|---|
| 0 | Foundation | 80–120k | 289k | -141% | ✅ |
| 1 | Core Emulator | 100–150k | ~110k | ~40k | ✅ |
| 2 | Packages & Payment | 120–180k | ~115k | ~5k | ✅ |
| 3 | User WebApp | 80–120k | ~117k | -46% | ✅ |
| 4 | Admin Backend | 100–140k | 0 | 100% | ⚪ |
| 5 | Membership & Rewards | 80–120k | 0 | 100% | ⚪ |
| 6 | Support ChatBot | 100–140k | 0 | 100% | ⚪ |
| 7 | Hardening | 60–100k | 0 | 100% | ⚪ |
| **รวม** | | **720–1,070k** | **~631k** | **~41%** | |

## Cost Tier (อ้างอิง pricing public — อาจปรับตามจริง)

| Model | Input | Output | ใช้กับ agent |
|---|---|---|---|
| Haiku 4.x | ~$0.80/1M | ~$4/1M | qa, reporter |
| Sonnet 4.5 | ~$3/1M | ~$15/1M | lead, backend, frontend, devops |
| Opus 4.x | ~$15/1M | ~$75/1M | architect (เฉพาะ) |

## Log (ลำดับเวลา)

| # | Date | Phase | Agent | Task | Tokens (in/out) | Cum. | Note |
|---|---|---|---|---|---|---|---|
| 1 | 2026-05-01 | 0 | architect | Schema design + api-contract | ~29k | ~29k | Prisma schema v1, 14 models |
| 2 | 2026-05-01 | 0 | devops | Monorepo scaffold | ~25k | ~54k | turbo, docker-compose, Dockerfiles |
| 3 | 2026-05-01 | 0 | backend | packages/db + shared + api | ~52k | ~106k | 14 models, zod schemas, health endpoint |
| 4 | 2026-05-01 | 0 | backend | Auth module + seed | ~51k | ~157k | 14 tests, argon2id, JWT |
| 5 | 2026-05-01 | 0 | frontend | apps/web + i18n + packages/ui | ~52k | ~209k | Next.js 15, next-intl, TH/EN |
| 6 | 2026-05-01 | 0 | devops | CI workflow | ~13k | ~222k | GitHub Actions |
| 7 | 2026-05-01 | 0 | qa | QA gate (initial) | ~9k | ~231k | PASS: 14 tests |
| 8 | 2026-05-01 | 0 | reporter | docs update (v1) | ~3k | ~234k | phases.md + token-budget.md |
| 9 | 2026-05-01 | 0 | qa | QA gate rerun (/ship) | ~37k | ~271k | FAIL→PASS: NODE_ENV bug, layout + not-found.tsx fix |
| 10 | 2026-05-01 | 0 | lead | Build fix (not-found + layout) | ~15k | ~286k | Fixed NODE_ENV=dev build error in web script |
| 11 | 2026-05-01 | 0 | reporter | docs update (v2) | ~3k | ~289k | phases.md blockers note + token-budget.md |
| 12 | 2026-05-02 | 1 | lead, backend×2, devops, frontend, qa×3, reporter | Task 2–4: mapToResponse fix, orchestrator+ws-scrcpy, emulator viewer, smoke-test.sh | ~85k / 0 | ~374k | API bug fix + docker-compose orchestrator/ws-scrcpy + web emulator viewer page |
| 13 | 2026-05-02 | 1 | reporter | Phase 1 close: docs update (phases.md, token-budget.md, CLAUDE.md) | ~25k / 0 | ~399k | Redroid defer note, smoke-test context, cumulative token update |
| 14 | 2026-05-02 | 2 | lead, backend×2, frontend, qa | Tasks 2.1–2.6: WalletModule, OrderModule, PaymentModule (Stripe webhook + idempotency), EmulatorService renewal, frontend pages, i18n | ~95k / 0 | ~494k | API + web design + Stripe adapter + QA |
| 15 | 2026-05-02 | 2 | qa + lead | QA rerun gate (53 tests + build verify) + .gitignore fix (tsbuildinfo) | ~8k / 0 | ~502k | ESLint ✅ TypeCheck ✅ Tests ✅ Build ✅, gitignore cleanup |
| 16 | 2026-05-02 | 2 | reporter | Phase 2 sign-off: phases.md (checklist update + QA note), token-budget.md (session row 15), CLAUDE.md (Current State) | ~6k / 0 | ~508k | Phase 2 ✅ Done, Phase 3 signal ready |
| 17 | 2026-05-02 | 3 | lead, backend, frontend, orchestrator, qa | UsersModule (GET/PATCH /users/me, POST /users/me/password + 9 tests), Landing/Auth/Dashboard/Profile/History pages, 6 i18n namespaces (TH+EN), ContainerService /dev/binder + adbSerial fixes, ws-scrcpy Dockerfile | ~117k / 0 | ~625k | 74 tests total ✅, Lighthouse score ≥80/95 ✅ |
| 18 | 2026-05-02 | 3 | reporter | Phase 3 sign-off: phases.md, token-budget.md, CLAUDE.md | ~4k / 0 | ~629k | Phase 3 ✅ Done, Phase 4 (Admin Backend) ready |
| 19 | 2026-05-02 | 3 | qa, reporter | Ship gate: test rerun (74 tests), CHANGELOG.md creation + token-budget update | ~5k / 0 | ~634k | Phase 3 ship ✅, 88.1% of total budget used |

## Tips ประหยัด Token

1. **ใช้ Haiku ให้คุ้ม** — qa/reporter ใช้ ~80% ของจำนวนครั้ง แต่จ่ายแค่ ~10% ของ cost
2. **ใช้ Opus น้อยที่สุด** — architect แค่ตอน design ใหม่จริง ๆ (Phase 0 + เปลี่ยน schema)
3. **อย่า dump file ใหญ่** ให้ subagent — ส่ง Glob pattern + section header แทน
4. **Single source of truth** — ใช้ `docs/api-contract.md` แทนการ re-explain
5. **Phase gating** — ปิด phase ก่อนค่อยขึ้นถัดไป (กัน rework)

## Alert Thresholds

- 🟢 < 60% ของ budget → on track
- 🟡 60–80% → reporter เตือน lead
- 🔴 > 80% → lead **ต้องแจ้ง User** ก่อนทำต่อ
