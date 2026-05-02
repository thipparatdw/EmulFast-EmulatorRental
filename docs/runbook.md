# EmulFast — Operations Runbook

> คู่มือการ deploy, restore, troubleshoot. **อัปเดตโดย `devops` agent** (lead สั่ง)

## Prerequisites (Linux Host สำหรับ Demo)

- Ubuntu 22.04 LTS+ (kernel ≥ 5.15)
- 4 vCPU, 16 GB RAM, 200 GB SSD ขั้นต่ำ
- KVM enabled — verify: `ls -l /dev/kvm` (ต้อง accessible)
- Docker 24+, docker compose v2
- Node.js 20+, pnpm 9+
- เปิด port 80, 443 (public), 22 (admin)

## Deploy ครั้งแรก

```bash
# 1. Clone
git clone <repo> emulfast && cd emulfast

# 2. Setup env
cp .env.example .env
# แก้ secrets, db url, payment keys

# 3. Pull base images (Redroid + ws-scrcpy)
docker pull redroid/redroid:10.0.0_64only-latest
docker pull redroid/redroid:12.0.0_64only-latest

# 4. Start infrastructure
docker compose -f infra/compose/docker-compose.prod.yml up -d postgres redis

# 5. Migrate DB
pnpm install
pnpm --filter db prisma:migrate:deploy
pnpm --filter db prisma:seed

# 6. Build images
docker compose -f infra/compose/docker-compose.prod.yml build

# 7. Start app stack
docker compose -f infra/compose/docker-compose.prod.yml up -d

# 8. ตรวจสอบ
docker compose -f infra/compose/docker-compose.prod.yml ps
curl -sf http://localhost/api/health || echo "FAIL"
```

## Day-2 Operations

### ดู logs

```bash
docker compose -f infra/compose/docker-compose.prod.yml logs -f api
docker compose -f infra/compose/docker-compose.prod.yml logs -f orchestrator
```

### Restart service

```bash
docker compose -f infra/compose/docker-compose.prod.yml restart api
```

### Scale (ในอนาคต — Demo รันเดี่ยว)

_(เพิ่มหลัง Phase 7)_

### Backup PostgreSQL

```bash
# Cron daily 02:00
0 2 * * * docker exec emulfast-postgres pg_dump -U postgres emulfast | gzip > /var/backups/emulfast-$(date +\%F).sql.gz
```

### Restore PostgreSQL

```bash
gunzip -c /var/backups/emulfast-2026-05-01.sql.gz | docker exec -i emulfast-postgres psql -U postgres emulfast
```

## Troubleshoot

### Redroid container ไม่ boot

```bash
docker logs emulfast-emu-<id> --tail=200
# ดู kernel + zygote startup
ls -l /dev/kvm  # ต้อง crw-rw---- root:kvm
```

ถ้า KVM ไม่ available → host ต้อง enable virtualization ใน BIOS + load module: `sudo modprobe kvm_intel` (หรือ kvm_amd)

### ws-scrcpy ต่อไม่ได้

```bash
docker exec emulfast-orchestrator adb -s emu-<id>:5555 shell whoami
# ต้อง return "shell" หรือ "root"
```

ถ้า ADB connect ไม่ได้ → ตรวจสอบ network bridge `emulfast-redroid`:

```bash
docker network inspect emulfast-redroid
```

### Webhook ไม่ trigger

```bash
# ตรวจ Stripe CLI สำหรับ replay
stripe events resend <event_id> --webhook-endpoint=we_xxx
```

### Disk เต็ม (Redroid containers)

```bash
# ลบ volume ของ emulator ที่ expired แล้ว (orchestrator scan ทุกนาที — ถ้าค้าง)
docker volume ls | grep emulfast-data | awk '{print $2}' | while read v; do
  # ตรวจอายุ container ก่อนลบ
done
```

⚠️ **ห้าม `docker system prune -af`** — ลบ volume ของ user ที่กำลังใช้งานอยู่!

## Rollback

```bash
# 1. หยุด app
docker compose -f infra/compose/docker-compose.prod.yml stop api web orchestrator

# 2. Checkout version ก่อนหน้า
git checkout <prev-tag>
docker compose -f infra/compose/docker-compose.prod.yml build

# 3. Restore DB (ถ้า migration เปลี่ยน)
gunzip -c /var/backups/emulfast-<before-deploy>.sql.gz | docker exec -i emulfast-postgres psql -U postgres emulfast

# 4. Start
docker compose -f infra/compose/docker-compose.prod.yml up -d
```

## Monitoring (Demo — minimal)

- `/api/health` endpoint — ใช้ uptime monitor (UptimeRobot, etc.)
- `docker stats` — manual check resource per emulator
- pino logs → `/var/log/emulfast/*.log` (rotate รายวัน)

_(Phase 7 จะเพิ่ม Prometheus/Grafana ถ้าต้องการ)_

## Contacts

- **Owner**: <user>
- **On-call**: <user>
- **Escalation**: <line/discord/etc.>
