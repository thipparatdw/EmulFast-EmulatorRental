# Skill: dev-run — รัน Project ทดสอบ (Local Dev)

ใช้เมื่อต้องการรัน EmulFast stack บน GCP server เพื่อทดสอบ

---

## Prerequisites

- Docker running (`docker ps` ไม่ error)
- `.env` อยู่ที่ root ของ project (`EmulFast-EmulatorRental/.env`)
- Node 22 + pnpm 9 ติดตั้งแล้ว
- GCP Firewall: เปิด port 3000, 4000, 8000

---

## ค่า .env ที่ต้องแก้สำหรับ GCP Server

```env
REDIS_URL=redis://localhost:6379
ORCHESTRATOR_URL=http://localhost:5000
NEXT_PUBLIC_API_URL=http://<SERVER_IP>:4000/api
NEXT_PUBLIC_WS_URL=ws://<SERVER_IP>:4000
NEXT_PUBLIC_APP_URL=http://<SERVER_IP>:3000
CORS_ORIGIN=http://<SERVER_IP>:3000
WEBSOCKET_BASE_URL=ws://<SERVER_IP>:8000
```

`<SERVER_IP>` = External IP ของ GCP server (ดูจาก `hostname -I` หรือ GCP console)

---

## 1. ล้าง Container จาก Phase 1 (ถ้ามี)

```bash
# ลบ redroid test container ที่ชน port 5555
docker stop redroid-test 2>/dev/null || true
docker rm redroid-test 2>/dev/null || true

# ลบ ws-scrcpy test container ที่ชน port 8000
docker stop ws-scrcpy-test 2>/dev/null || true
docker rm ws-scrcpy-test 2>/dev/null || true
docker rm emulfast-ws-scrcpy 2>/dev/null || true
```

---

## 2. Start Infrastructure (Postgres + Redis)

```bash
docker compose -f infra/compose/docker-compose.yml up -d postgres redis
```

ตรวจสอบ:
```bash
docker compose -f infra/compose/docker-compose.yml ps
```
ต้องเห็น `(healthy)` ทั้งคู่

---

## 3. DB Migration + Seed (ครั้งแรกเท่านั้น)

```bash
set -a && source .env && set +a
pnpm --filter @emulfast/db exec prisma migrate dev --name init
pnpm --filter @emulfast/db db:seed
```

**หมายเหตุ**: ถ้ารัน `migrate dev` แล้วเจอ "No migration found" ให้รันปกติได้เลย

---

## 4. Build API

```bash
cd apps/api
rm -f tsconfig.tsbuildinfo   # ล้าง incremental cache ก่อนทุกครั้ง
node_modules/.bin/nest build
cd ../..
```

---

## 5. Start API (port 4000)

```bash
set -a && source .env && set +a
node apps/api/dist/main.js > /tmp/api.log 2>&1 &
echo "API PID: $!"
```

ตรวจสอบ:
```bash
ss -tlnp | grep 4000
node -e "const http=require('http');http.get('http://localhost:4000/api/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))}).on('error',e=>console.error(e.message))"
```
ต้องเห็น `{"status":"ok",...}`

---

## 6. Start Orchestrator (port 5000)

```bash
set -a && source .env && set +a
cd apps/orchestrator
rm -f tsconfig.tsbuildinfo
node_modules/.bin/nest build
node dist/main.js > /tmp/orchestrator.log 2>&1 &
echo "Orchestrator PID: $!"
cd ../..
```

ตรวจสอบ:
```bash
ss -tlnp | grep 5000
```

---

## 7. Start ws-scrcpy (port 8000)

```bash
docker compose -f infra/compose/docker-compose.yml up -d ws-scrcpy
```

ตรวจสอบ:
```bash
docker logs emulfast-ws-scrcpy --tail 20
# ต้องเห็น "Listening on ..."
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
# ต้องเห็น 200
```

---

## 8. Start Frontend (port 3000)

```bash
set -a && source .env && set +a
pnpm --filter @emulfast/web exec next dev > /tmp/web.log 2>&1 &
echo "Web PID: $!"
```

ตรวจสอบ:
```bash
tail -5 /tmp/web.log
# ต้องเห็น "✓ Ready in ..."
```

---

## 9. เข้าใช้งาน

| URL | คำอธิบาย |
|---|---|
| `http://<SERVER_IP>:3000` | Frontend |
| `http://localhost:4000/api/docs` | Swagger UI |
| `http://localhost:8080` | Adminer (DB viewer) |
| `http://<SERVER_IP>:8000` | ws-scrcpy ตรงๆ (debug) |

**Test accounts** (จาก seed):
| Email | Password | Role |
|---|---|---|
| `admin@emulfast.local` | `Admin@1234` | admin |
| `dev@emulfast.local` | `Dev@1234` | user |

---

## 10. ทดสอบ Full Flow

1. Login → เลือก Package → ชำระเงิน (Stripe test card: `4242 4242 4242 4242`)
2. Stripe webhook URL = `http://<SERVER_IP>:4000/api/payments/webhook` (ต้องใส่ port 4000)
3. หลังชำระ → ไปหน้า Dashboard → กด "ใช้งาน" → หน้า Emulator Viewer
4. รอ ~30 วินาที แล้ว ADB connect อัตโนมัติ
5. iframe แสดง Android screen จาก `http://<SERVER_IP>:8000/?action=stream&udid=<ip>:5555`

---

## Debug: ADB Connect ด้วยตนเอง

ถ้า emulator ขึ้น `provisioning` นานเกิน 1 นาที:

```bash
# ดู IP ของ container บน emulfast-redroid network
docker inspect <container_name> | grep -A5 '"emulfast-redroid"'

# connect ADB ด้วยมือ
docker exec emulfast-ws-scrcpy adb connect <container_ip>:5555
docker exec emulfast-ws-scrcpy adb devices
```

ถ้า emulator stuck ที่ `provisioning` ใน UI แต่ container running จริง:
```sql
-- ใช้ Adminer หรือ psql
UPDATE "Emulator" SET status='running', "startedAt"=NOW() WHERE id='<emulator_id>';
```

---

## Troubleshooting

| ปัญหา | สาเหตุ | แก้ |
|---|---|---|
| `nest build` exit 0 แต่ไม่มี dist/ | `tsconfig.tsbuildinfo` stale | `rm -f apps/api/tsconfig.tsbuildinfo` |
| API error: `EAI_AGAIN redis` | BullMQ Worker retry noise | ไม่กระทบ API หลัก — ปกติ |
| Login: "An unexpected error occurred" | CORS หรือ port ไม่เปิด | ตรวจสอบ `CORS_ORIGIN` และ GCP firewall |
| Packages page ว่าง | `NEXT_PUBLIC_API_URL` ยังเป็น `localhost` | แก้ .env ให้ใช้ IP จริง แล้ว restart frontend |
| `EADDRINUSE :::4000` | Process เก่ายังรันอยู่ | `fuser -k 4000/tcp` |
| Port 5555 already allocated | `redroid-test` container จาก Phase 1 | `docker stop redroid-test && docker rm redroid-test` |
| ws-scrcpy port 8000 conflict | `ws-scrcpy-test` container จาก Phase 1 | `docker stop ws-scrcpy-test && docker rm ws-scrcpy-test && docker rm emulfast-ws-scrcpy` |
| `payment/success` spinner ตลอด | Stripe webhook URL ไม่มี port | ใส่ `:4000` ใน Stripe Dashboard |
| iframe ว่าง / `Cannot GET /ws/...` | URL format ผิด | websocketPath ต้องเป็น `/?action=stream&udid=<ip>:5555` |
| Emulator stream ไม่ขึ้นใน iframe | `ws://` ใช้เป็น iframe src ไม่ได้ | ต้องแปลงเป็น `http://` ก่อน |
