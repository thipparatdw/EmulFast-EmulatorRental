# Skill: dev-run — รัน Project ทดสอบ (Local Dev)

ใช้เมื่อต้องการรัน EmulFast stack เพื่อทดสอบ

---

## Environment Files

| ไฟล์ | ใช้กับ | ใน git |
|---|---|---|
| `.env` | Linux / GCP / WSL2 | ❌ gitignored |
| `.env.dev` | Windows local dev | ❌ gitignored |
| `.env.example` | Template สำหรับ Linux/WSL2 | ✅ |
| `.env.dev.example` | Template สำหรับ Windows | ✅ |

**ครั้งแรก (Windows)**: `cp .env.dev.example .env.dev` แล้วแทนที่ `XXXXX` ด้วยค่าจาก `.env`

---

## Prerequisites

### Windows (Local Dev)
- Docker Desktop รันอยู่ (`docker ps` ไม่ error)
- `.env.dev` อยู่ที่ root ของ project
- Node 20+ และ pnpm 9+ ติดตั้งแล้ว

### WSL2 (Local Dev)
- Docker Engine ติดตั้งแล้ว (`docker ps` ไม่ error, socket อยู่ที่ `/var/run/docker.sock`)
- `.env` อยู่ที่ root ของ project
- Node 20+ และ pnpm 9+ ติดตั้งแล้ว

### Linux / GCP (Production)
- Docker + Docker Compose ติดตั้งแล้ว
- `.env` อยู่ที่ root ของ project
- GCP Firewall: เปิด port 3000, 4000, 8000

---

## WSL2 One-Time Setup (ทำครั้งแรกเท่านั้น)

> ข้ามส่วนนี้ถ้าใช้ Windows หรือ Linux/GCP

### 1. แก้ CRLF ใน `.env`

`.env` ที่สร้างบน Windows มี `\r\n` line endings ซึ่งทำให้ `source .env` fail:

```bash
tr -d '\r' < .env > .env.tmp && mv .env.tmp .env
echo "CRLF fixed"
```

ตรวจสอบ:
```bash
grep -c $'\r' .env && echo "still has CRLF" || echo "OK"
# ต้องเห็น "OK"
```

### 2. ตรวจสอบ DATABASE_URL

DATABASE_URL ต้องใช้ user `emulfast` (ตามที่ docker-compose กำหนด):

```bash
set -a && source .env && set +a
echo $DATABASE_URL
# ต้องขึ้นต้นด้วย: postgresql://emulfast@localhost:5432/emulfast
```

ถ้าขึ้นต้นด้วย `postgres:postgres` ให้แก้:
```bash
sed -i 's|postgresql://postgres:postgres@localhost|postgresql://emulfast@localhost|g' .env
```

### 3. เพิ่ม pg_hba Trust Rule (หลัง Postgres start ครั้งแรก)

WSL2 host connect เข้า Postgres container ผ่าน Docker bridge IP `172.18.0.1` ซึ่งต้องการ trust rule พิเศษ ทำ **หลัง** `docker compose up -d postgres` แล้วเท่านั้น:

```bash
# ตรวจ Docker bridge IP ก่อน (ส่วนใหญ่คือ 172.18.0.1)
ip route show | grep "br-"
# ดู "src xxx.xxx.x.x" — นั่นคือ Docker bridge IP

# เพิ่ม trust rule (แทนที่ 172.18.0.1 ถ้า IP ต่างกัน)
BRIDGE_IP=172.18.0.1
docker exec -u postgres emulfast-postgres bash -c "
  sed -i '/^host all all all scram/i host all all ${BRIDGE_IP}/32 trust' /var/lib/postgresql/data/pg_hba.conf
  pg_ctl reload -D /var/lib/postgresql/data
"
echo "pg_hba trust rule added"
```

> Rule นี้เก็บใน Docker volume — ไม่ต้องทำซ้ำทุกครั้งที่ restart container

---

## คำสั่งตาม Platform

ทุก section ด้านล่างมี 3 แถบ: **Windows**, **WSL2**, **Linux/GCP**

---

## 1. ล้าง Container เก่า (ถ้ามี)

```bash
docker stop redroid-test ws-scrcpy-test emulfast-ws-scrcpy 2>/dev/null || true
docker rm   redroid-test ws-scrcpy-test emulfast-ws-scrcpy 2>/dev/null || true
```
*(คำสั่งนี้เหมือนกันทุก platform)*

---

## 2. Start Infrastructure

**Windows:**
```bash
docker compose -f infra/compose/docker-compose.yml --env-file .env.dev up -d postgres redis
```

**WSL2:**
```bash
# WSL2: start infra ทั้งหมดพร้อมกัน รวม orchestrator + ws-scrcpy
docker compose -f infra/compose/docker-compose.yml --env-file .env up -d postgres redis orchestrator ws-scrcpy
```

**Linux/GCP:**
```bash
docker compose -f infra/compose/docker-compose.yml --env-file .env up -d postgres redis
```

ตรวจสอบ:
```bash
docker compose -f infra/compose/docker-compose.yml ps
# WSL2/Linux: ต้องเห็น (healthy) ทุก service
# Windows: ต้องเห็น postgres, redis (healthy)
```

> **WSL2**: ถ้า `orchestrator` start fail ด้วย "address already in use" — มี Node process เก่าค้างอยู่
> แก้ด้วย `fuser -k 5000/tcp 2>/dev/null || true` แล้ว start ใหม่

---

## 3. DB Migration + Seed (ครั้งแรกเท่านั้น)

**Windows (Git Bash / bash shell):**
```bash
set -a && source .env.dev && set +a
pnpm --filter @emulfast/db exec prisma migrate dev --name init
pnpm --filter @emulfast/db db:seed
```

**WSL2 / Linux/GCP:**
```bash
set -a && source .env && set +a
pnpm --filter @emulfast/db exec prisma migrate dev --name init
pnpm --filter @emulfast/db db:seed
```

---

## 4. Build API

```bash
# (เหมือนกันทุก platform — รันจาก project root)
cd apps/api && rm -f tsconfig.tsbuildinfo && node_modules/.bin/nest build && cd ../..
```

---

## 5. Start API (port 4000)

**Windows (Git Bash):**
```bash
set -a && source .env.dev && set +a
node apps/api/dist/main.js > /tmp/api.log 2>&1 &
echo "API PID: $!"
```

**WSL2 / Linux/GCP:**
```bash
set -a && source .env && set +a
node apps/api/dist/main.js > /tmp/api.log 2>&1 &
echo "API PID: $!"
```

ตรวจสอบ:
```bash
node -e "const http=require('http');http.get('http://localhost:4000/api/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))}).on('error',e=>console.error(e.message))"
# ต้องเห็น {"status":"ok",...}
```

---

## 6. Start Orchestrator (port 5000)

> **WSL2**: ข้ามขั้นตอนนี้ — Orchestrator รันเป็น Docker container ไปแล้วใน Step 2

**Windows (Git Bash):**
```bash
set -a && source .env.dev && set +a
cd apps/orchestrator
rm -f tsconfig.tsbuildinfo && node_modules/.bin/nest build
node dist/main.js > /tmp/orchestrator.log 2>&1 &
echo "Orchestrator PID: $!"
cd ../..
```

**Linux/GCP:**
```bash
set -a && source .env && set +a
cd apps/orchestrator
rm -f tsconfig.tsbuildinfo && node_modules/.bin/nest build
node dist/main.js > /tmp/orchestrator.log 2>&1 &
echo "Orchestrator PID: $!"
cd ../..
```

> **หมายเหตุ Windows**: Orchestrator จะ connect ผ่าน `//./pipe/docker_engine` อัตโนมัติ
> Log จะแสดง: `Docker connected via //./pipe/docker_engine`

---

## 7. Start ws-scrcpy (port 8000)

> **WSL2**: ข้ามขั้นตอนนี้ — ws-scrcpy รันเป็น Docker container ไปแล้วใน Step 2

**Windows:**
```bash
docker compose -f infra/compose/docker-compose.yml --env-file .env.dev up -d ws-scrcpy
```

**Linux/GCP:**
```bash
docker compose -f infra/compose/docker-compose.yml --env-file .env up -d ws-scrcpy
```

ตรวจสอบ:
```bash
docker logs emulfast-ws-scrcpy --tail 20
# ต้องเห็น "Listening on ..."
```

---

## 8. Start Frontend (port 3000)

**Windows (Git Bash):**
```bash
set -a && source .env.dev && set +a
pnpm --filter @emulfast/web exec next dev > /tmp/web.log 2>&1 &
echo "Web PID: $!"
```

**WSL2 / Linux/GCP:**
```bash
set -a && source .env && set +a
pnpm --filter @emulfast/web exec next dev > /tmp/web.log 2>&1 &
echo "Web PID: $!"
```

ตรวจสอบ:
```bash
tail -f /tmp/web.log
# ต้องเห็น "✓ Ready in ..."
```

---

## 9. เข้าใช้งาน

### Windows / WSL2 (localhost)
| URL | คำอธิบาย |
|---|---|
| `http://localhost:3000` | Frontend |
| `http://localhost:4000/api/docs` | Swagger UI |
| `http://localhost:8080` | Adminer (DB viewer) |

### Linux/GCP (Server IP)
| URL | คำอธิบาย |
|---|---|
| `http://<SERVER_IP>:3000` | Frontend |
| `http://localhost:4000/api/docs` | Swagger UI |
| `http://localhost:8080` | Adminer |
| `http://<SERVER_IP>:8000` | ws-scrcpy debug |

**Test accounts** (จาก seed):
| Email | Password | Role |
|---|---|---|
| `admin@emulfast.local` | `Admin@1234` | admin |
| `dev@emulfast.local` | `Dev@1234` | user |

---

## Kill Processes (หยุดงาน)

**Windows (PowerShell):**
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
docker compose -f infra/compose/docker-compose.yml --env-file .env.dev down
```

**WSL2:**
```bash
# หยุด Node processes (API + Frontend)
fuser -k 4000/tcp 3000/tcp 2>/dev/null || true
# หยุด Docker containers ทั้งหมด (postgres, redis, orchestrator, ws-scrcpy)
docker compose -f infra/compose/docker-compose.yml --env-file .env down
```

**Linux/GCP:**
```bash
fuser -k 4000/tcp 5000/tcp 3000/tcp 2>/dev/null || true
docker compose -f infra/compose/docker-compose.yml --env-file .env down
```

---

## ข้อจำกัดตาม Platform

| Feature | Windows | WSL2 | Linux/GCP |
|---|---|---|---|
| Postgres + Redis | ✅ Docker Desktop | ✅ Docker Engine | ✅ |
| API + Frontend | ✅ localhost | ✅ localhost | ✅ |
| Orchestrator | ✅ Node process (named pipe) | ✅ Docker container (unix socket) | ✅ Node process |
| ws-scrcpy | ✅ Docker Desktop | ✅ Docker container | ✅ Docker |
| Redroid (Android Emulator) | ❌ ต้องการ `/dev/kvm` | ❌ ต้องการ `/dev/kvm` + kernel modules | ✅ |
| ws-scrcpy + ADB stream | ❌ ไม่มี emulator | ❌ ไม่มี emulator | ✅ |

**สรุป**: พัฒนา Phase 4+ บน Windows/WSL2 ได้ปกติ — ทดสอบ emulator จริงต้องใช้ GCP

---

## Troubleshooting

| ปัญหา | สาเหตุ | แก้ |
|---|---|---|
| `POSTGRES_PASSWORD not set` | ลืม `--env-file` ใน docker compose | เพิ่ม `--env-file .env` (WSL2/Linux) / `--env-file .env.dev` (Windows) |
| `source .env` มี `\r` error | CRLF line endings | `tr -d '\r' < .env > .env.tmp && mv .env.tmp .env` |
| Prisma: `Authentication failed` (WSL2) | DATABASE_URL ใช้ user `postgres` แทน `emulfast` | `sed -i 's|postgres:postgres@|emulfast@|' .env` |
| Prisma: `Authentication failed` ยังอยู่ (WSL2) | pg_hba ไม่มี trust rule สำหรับ bridge IP | ทำ WSL2 One-Time Setup ข้อ 3 |
| `EADDRINUSE :::5000` (WSL2) | Orchestrator Node process เก่าค้างอยู่ก่อน docker compose | `fuser -k 5000/tcp 2>/dev/null` |
| `nest build` ไม่มี dist/ | tsconfig cache เก่า | `rm -f apps/api/tsconfig.tsbuildinfo` |
| API error: `EAI_AGAIN redis` | BullMQ Worker retry noise | ปกติ — ไม่กระทบ API |
| Login: "unexpected error" | CORS ไม่ตรง | ตรวจ `CORS_ORIGIN` ใน .env |
| `EADDRINUSE :::4000` | Process เก่ายังรันอยู่ | `fuser -k 4000/tcp` |
| Orchestrator Docker: socket error | Docker daemon ยังไม่ start | `sudo service docker start` |
| `payment/success` spinner ตลอด | Stripe webhook URL ผิด | ใส่ `:4000` ใน Stripe Dashboard |
