# EmulFast (Demo)

> ระบบเช่า Android Emulator (Cloud Phone) ผ่าน WebApp รันบน Linux Server — สร้างด้วย AI Multi-Agent System

## TL;DR

โปรเจกต์นี้ใช้ **Claude Code CLI** + **AI Multi-Agent System** (7 agents) เป็นผู้พัฒนาหลัก. คุณ (User) แค่เปิด Claude Code, สั่งคำสั่งเช่น `/plan-phase 0`, แล้วรออนุมัติงานทีละ phase. **ยังไม่มี source code** — repository นี้มีแค่ **Agent Pack** + **docs skeleton** สำหรับให้ AI เริ่มสร้างทุกอย่าง

## Quick Start

### 1. ติดตั้ง Claude Code CLI

```bash
# macOS / Linux / WSL
curl -fsSL https://claude.ai/install.sh | bash

# หรือผ่าน npm
npm install -g @anthropic-ai/claude-code
```

ดูคู่มือ: https://docs.claude.com/en/docs/claude-code/quickstart

### 2. เปิดโปรเจกต์บน VS Code

```bash
code "d:/EmulFast - Emulator Rental"
```

### 3. เปิด Claude Code ใน terminal ของ VS Code

```bash
claude
```

ตอน startup, Claude Code จะอ่านอัตโนมัติ:

- `CLAUDE.md` — project memory
- `.claude/agents/*.md` — subagent definitions
- `.claude/commands/*.md` — custom slash commands
- `.claude/settings.local.json` — tool permissions

### 4. เริ่ม Phase 0

```
/plan-phase 0
```

`lead` agent จะวิเคราะห์ scope, แตก task, มอบหมายให้ subagents ตามความเหมาะสม. จบ phase แล้วสั่ง:

```
/ship
```

เพื่อรัน QA gate + รอคุณอนุมัติ → ขึ้น `/plan-phase 1` ต่อ

## Agent Pack (สรุป)

| Agent | Model | บทบาท |
|---|---|---|
| `lead` | Sonnet | PM/Orchestrator — จุดเข้า-ออกเดียวของ User |
| `architect` | Opus | System Design + DB Schema + API Contract |
| `backend` | Sonnet | NestJS API + Prisma + BullMQ |
| `frontend` | Sonnet | Next.js + UI + i18n TH/EN |
| `devops` | Sonnet | Docker + Redroid + Nginx + CI |
| `qa` | Haiku | Lint + Typecheck + Test gate |
| `reporter` | Haiku | Docs + Token tracking |

ดูรายละเอียดใน [`AGENTS.md`](./AGENTS.md)

## Custom Commands

| Command | Purpose |
|---|---|
| `/plan-phase <N>` | เริ่ม phase ใหม่ (0–7) |
| `/handoff <from>-><to> <task>` | ส่งงานข้าม agent ผ่าน lead |
| `/token-report [phase]` | รายงาน token cost |
| `/ship` | รัน QA gate + ส่ง User approve |
| `/research <question>` | เรียก DeepSeek CLI ให้ lead ทำ research |
| `/debug-log <path-to-log>` | เรียก GPT CLI วิเคราะห์ error log |

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind v4 + shadcn/ui + next-intl
- **Backend**: NestJS 11 + Prisma + Redis + BullMQ + zod
- **DB**: PostgreSQL 16
- **Emulator**: Redroid (Docker-based Android) + ws-scrcpy (WebSocket H.264)
- **Payment**: Stripe (Card) + Omise (PromptPay) + Fcoin (internal wallet)
- **Repo**: pnpm + Turborepo monorepo
- **Deploy**: Docker Compose + Nginx + Linux (Ubuntu 22.04+ with KVM)

## Phases

7 phases แบ่งตาม [`docs/phases.md`](./docs/phases.md):

0. **Foundation** — Monorepo, DB, Auth, i18n
1. **Core Emulator** — Redroid + scrcpy + session API
2. **Packages & Payment** — SFAST/MFAST, Fcoin wallet, Stripe/PromptPay
3. **User WebApp** — Browse, dashboard, my emulators
4. **Admin Backend** — RBAC, dashboard, user/order management
5. **Membership & Rewards** — Tier, points, promocode, redemption
6. **Support ChatBot** — Auto FAQ + staff handoff + image upload
7. **Hardening** — Security, performance, deploy guide

## Packages (Demo)

| Code | Android | CPU | RAM | ROM |
|---|---|---|---|---|
| **SFAST** | 10 | 3 cores | 3 GB | 30 GB |
| **MFAST** | 10 หรือ 12 | 3 cores | 4 GB | 64 GB |

## Token Budget (เป้าหมาย)

รวมทุก phase: **~720k–1,070k tokens** (ดู [`docs/token-budget.md`](./docs/token-budget.md))

หลักการประหยัด:
- ใช้ **Haiku** สำหรับ qa + reporter (ลด ~80% เทียบ Sonnet)
- ใช้ **Opus** เฉพาะตอน design ใหญ่ (architect)
- subagent context isolation
- single source of truth ใน docs

## GPT + DeepSeek CLI (Ubuntu)

โปรเจกต์นี้รองรับ workflow เพิ่มเติม:
- `lead -> DeepSeek -> lead -> user` สำหรับงาน research
- `qa/lead -> GPT` สำหรับงาน debug จาก log

### 1) เตรียมเครื่องมือ

```bash
sudo apt-get update
sudo apt-get install -y curl jq
chmod +x scripts/*.sh
```

### 2) ตั้งค่า environment

คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่า:
- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`

หรือ export ชั่วคราวใน shell:

```bash
export DEEPSEEK_API_KEY="your_deepseek_key"
export OPENAI_API_KEY="your_openai_key"
```

### 3) ใช้งานสคริปต์ตรง

```bash
bash ./scripts/deepseek-research.sh "How should we tune ws-scrcpy behind Nginx for low latency?"
bash ./scripts/gpt-debug.sh ./logs/ci-failure.log
```

ผลลัพธ์จะถูกบันทึกที่:
- `docs/research/*.md`
- `docs/debug/*.md`

### 4) ใช้งานผ่าน Claude commands

ใน Claude CLI:

```text
/research แนวทาง secure websocket proxy สำหรับ ws-scrcpy
/debug-log ./logs/typecheck-error.log
```

`/research` จะให้ lead สรุปตัวเลือกกลับมาถามคุณต่อก่อนตัดสินใจ

## โครงสร้าง Repo

```text
EmulFast/
├── .claude/                       # Agent definitions (อ่านโดย Claude Code)
│   ├── agents/                    # 7 subagents
│   ├── commands/                  # 6 slash commands
│   └── settings.local.json        # tool permissions
├── CLAUDE.md                      # Project memory (loaded ทุก session)
├── AGENTS.md                      # Agent map + workflow
├── README.md                      # ไฟล์นี้
├── scripts/                       # External AI helper scripts (Ubuntu CLI)
├── docs/
│   ├── architecture.md            # System design (architect-owned)
│   ├── api-contract.md            # API spec (architect-owned)
│   ├── phases.md                  # Progress tracker (reporter-owned)
│   ├── token-budget.md            # Token log (reporter-owned)
│   ├── runbook.md                 # Operations (devops-owned)
│   ├── research/                  # DeepSeek output
│   └── debug/                     # GPT debug output
└── (apps/, packages/, infra/ — สร้างใน Phase 0)
```

## ขั้นตอนแนะนำ (สำหรับเจ้าของโปรเจกต์)

1. ✅ เปิด VS Code + รัน `claude`
2. ✅ พิมพ์ `/plan-phase 0` — `lead` agent จะวิเคราะห์ + แตก task ให้
3. ⏸️ รอ subagents ทำงาน (อาจมี prompt ขออนุมัติ tool calls แรก ๆ)
4. 🔍 อ่านสรุปจาก `lead` ตอนจบ phase
5. ✅ ถ้าโอเค → สั่ง `/ship` → รออนุมัติ → `/plan-phase 1`
6. 🔁 ทำซ้ำจนถึง Phase 7

## ห้ามทำ

- ❌ ห้าม commit `.env`, secrets เข้า git
- ❌ ห้ามให้ agent push ไป remote โดยอัตโนมัติ
- ❌ ห้ามแก้ schema.prisma นอกจาก architect
- ❌ ห้ามข้าม QA gate

## License

Internal use — Demo only

## Credits

- [Redroid](https://github.com/remote-android/redroid-doc) — Docker-based Android
- [ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy) — WebSocket scrcpy frontend
- Inspired by LDCloud, UGPhone (system reference only — ไม่ copy UX)
