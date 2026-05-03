#!/usr/bin/env bash
# EmulFast Phase 1 Smoke Test
#
# รันบน Linux server จริงที่มี stack ครบ (postgres, redis, api, orchestrator, redroid)
# WSL2 ไม่รองรับ Redroid (ต้องการ /dev/binder) — ข้าม Step 6-8 จะถูก skip อัตโนมัติ
#
# Usage:
#   ./scripts/smoke-test.sh
#
# Env overrides:
#   API_URL             default: http://localhost:4000
#   ORCHESTRATOR_URL    default: http://localhost:5000
#   ORCHESTRATOR_TOKEN  default: "" (dev mode = no auth required)

set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:5000}"
ORCHESTRATOR_TOKEN="${ORCHESTRATOR_TOKEN:-}"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ PASS${NC} — $1"; }
fail() { echo -e "${RED}❌ FAIL${NC} — $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}⚠  SKIP${NC} — $1"; }
header() { echo -e "\n${YELLOW}▶ $1${NC}"; }

FAILURES=0
CONTAINER_ID=""

# ─── Cleanup trap ─────────────────────────────────────────────────────────────
cleanup() {
  if [[ -n "$CONTAINER_ID" ]]; then
    echo -e "\n${YELLOW}[cleanup] ลบ container ที่ค้างอยู่: $CONTAINER_ID${NC}"
    ORCH_HEADERS=(-H "Content-Type: application/json")
    if [[ -n "$ORCHESTRATOR_TOKEN" ]]; then
      ORCH_HEADERS+=(-H "Authorization: Bearer $ORCHESTRATOR_TOKEN")
    fi
    curl -sf -X DELETE "${ORCHESTRATOR_URL}/containers/${CONTAINER_ID}" \
      "${ORCH_HEADERS[@]}" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ─── Preflight ────────────────────────────────────────────────────────────────
header "Preflight — ตรวจ dependencies"
for cmd in curl jq; do
  if ! command -v "$cmd" &> /dev/null; then
    fail "ไม่พบ '$cmd' — ติดตั้งก่อนรัน script"
    exit 1
  fi
done
pass "curl + jq พร้อมใช้งาน"

# ─── Step 1: Health Checks ───────────────────────────────────────────────────
header "Step 1 — Health checks"

if curl -sf "${API_URL}/api/health" > /dev/null; then
  pass "API health (${API_URL}/api/health)"
else
  fail "API health — ตรวจสอบว่า api service รันอยู่"
fi

if curl -sf "${ORCHESTRATOR_URL}/health" > /dev/null; then
  pass "Orchestrator health (${ORCHESTRATOR_URL}/health)"
else
  fail "Orchestrator health — ตรวจสอบว่า orchestrator service รันอยู่"
fi

# ─── Step 2: Register test user ──────────────────────────────────────────────
header "Step 2 — Register test user"

EPOCH=$(date +%s)
TEST_EMAIL="smoke-${EPOCH}@test.local"
TEST_PASSWORD="SmokeTest1234!"

REGISTER_BODY=$(jq -n \
  --arg name "Smoke Test User" \
  --arg email "$TEST_EMAIL" \
  --arg password "$TEST_PASSWORD" \
  '{name: $name, email: $email, password: $password, acceptTerms: true}')

REGISTER_RESP=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d "$REGISTER_BODY" \
  "${API_URL}/api/auth/register" || echo "ERROR")

if [[ "$REGISTER_RESP" == "ERROR" ]]; then
  fail "Register user — HTTP error"
else
  pass "Register: ${TEST_EMAIL}"
fi

# ─── Step 3: Login ────────────────────────────────────────────────────────────
header "Step 3 — Login + get token"

LOGIN_BODY=$(jq -n \
  --arg email "$TEST_EMAIL" \
  --arg password "$TEST_PASSWORD" \
  '{email: $email, password: $password}')

LOGIN_RESP=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d "$LOGIN_BODY" \
  "${API_URL}/api/auth/login" || echo "ERROR")

if [[ "$LOGIN_RESP" == "ERROR" ]]; then
  fail "Login — HTTP error"
  ACCESS_TOKEN=""
else
  ACCESS_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.accessToken // empty')
  USER_ID=$(echo "$LOGIN_RESP" | jq -r '.data.user.id // empty')
  if [[ -z "$ACCESS_TOKEN" ]]; then
    fail "Login — ไม่พบ accessToken ใน response"
  else
    pass "Login สำเร็จ — userId: ${USER_ID}"
  fi
fi

# ─── Step 4: Get packages ─────────────────────────────────────────────────────
header "Step 4 — ตรวจ packages (SFAST ต้องมีใน DB)"

if [[ -z "$ACCESS_TOKEN" ]]; then
  warn "ข้าม — ไม่มี token"
else
  PKG_RESP=$(curl -sf \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${API_URL}/api/packages" || echo "ERROR")

  if [[ "$PKG_RESP" == "ERROR" ]]; then
    fail "GET /api/packages — HTTP error"
  else
    SFAST_CODE=$(echo "$PKG_RESP" | jq -r '.data.packages[]? | select(.code == "SFAST") | .code' 2>/dev/null || true)
    if [[ "$SFAST_CODE" == "SFAST" ]]; then
      pass "SFAST package พบใน DB"
    else
      fail "SFAST package ไม่พบ — ตรวจสอบว่ารัน seed script แล้ว"
    fi
  fi
fi

# ─── Step 5: Order (STUB — Phase 2) ──────────────────────────────────────────
header "Step 5 — Create order (STUB)"
# TODO: Phase 2 — OrderModule ยังไม่ implement
# เมื่อ Phase 2 เสร็จ ให้เพิ่ม:
#   POST /api/orders { packageCode: "SFAST", paymentMethod: "fcoin", billingDays: 1 }
#   → เก็บ orderId สำหรับ POST /api/emulators
warn "OrderModule ยังไม่มี (Phase 2) — ใช้ orchestrator โดยตรงแทน"

# ─── Step 6: Create container via orchestrator ───────────────────────────────
header "Step 6 — Create Redroid container (ผ่าน orchestrator)"

# ตรวจ /dev/binder — ถ้าไม่มีคือ WSL2 ที่ยังไม่พร้อม
if [[ ! -e /dev/binder ]]; then
  warn "ข้าม Steps 6-8 — /dev/binder ไม่มี (WSL2 ต้องการ custom kernel สำหรับ Redroid)"
  SKIP_REDROID=1
else
  SKIP_REDROID=0
fi

if [[ "${SKIP_REDROID:-0}" -eq 0 ]]; then
  EXPIRES_AT=$(date -u -d "+1 hour" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
    || date -u -v+1H '+%Y-%m-%dT%H:%M:%SZ')  # macOS fallback

  ORCH_HEADERS=(-H "Content-Type: application/json")
  if [[ -n "$ORCHESTRATOR_TOKEN" ]]; then
    ORCH_HEADERS+=(-H "Authorization: Bearer $ORCHESTRATOR_TOKEN")
  fi

  CONTAINER_BODY=$(jq -n \
    --arg userId "${USER_ID:-smoke-user}" \
    --arg packageCode "SFAST" \
    --arg expiresAt "$EXPIRES_AT" \
    '{userId: $userId, packageCode: $packageCode, expiresAt: $expiresAt}')

  CREATE_RESP=$(curl -sf -X POST \
    "${ORCH_HEADERS[@]}" \
    -d "$CONTAINER_BODY" \
    "${ORCHESTRATOR_URL}/containers" || echo "ERROR")

  if [[ "$CREATE_RESP" == "ERROR" ]]; then
    fail "Create container — HTTP error"
  else
    CONTAINER_ID=$(echo "$CREATE_RESP" | jq -r '.data.containerId // .containerId // empty')
    if [[ -z "$CONTAINER_ID" ]]; then
      fail "Create container — ไม่พบ containerId ใน response"
    else
      pass "Container created: ${CONTAINER_ID}"
    fi
  fi
fi

# ─── Step 7: Check container status ──────────────────────────────────────────
header "Step 7 — ตรวจ container status"

if [[ "${SKIP_REDROID:-0}" -eq 1 ]] || [[ -z "$CONTAINER_ID" ]]; then
  warn "ข้าม — ไม่มี container"
else
  STATUS_RESP=$(curl -sf \
    "${ORCH_HEADERS[@]}" \
    "${ORCHESTRATOR_URL}/containers/${CONTAINER_ID}" || echo "ERROR")

  if [[ "$STATUS_RESP" == "ERROR" ]]; then
    fail "GET /containers/:id — HTTP error"
  else
    CONTAINER_STATE=$(echo "$STATUS_RESP" | jq -r '.data.status // .status // "unknown"')
    if [[ "$CONTAINER_STATE" == "error" || "$CONTAINER_STATE" == "failed" ]]; then
      fail "Container state = ${CONTAINER_STATE}"
    else
      pass "Container state: ${CONTAINER_STATE}"
    fi
  fi
fi

# ─── Step 8: Delete container ─────────────────────────────────────────────────
header "Step 8 — ลบ container"

if [[ "${SKIP_REDROID:-0}" -eq 1 ]] || [[ -z "$CONTAINER_ID" ]]; then
  warn "ข้าม — ไม่มี container"
else
  echo "รอ 10 วินาทีก่อนลบ..."
  sleep 10

  DELETE_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X DELETE \
    "${ORCH_HEADERS[@]}" \
    "${ORCHESTRATOR_URL}/containers/${CONTAINER_ID}" || echo "000")

  if [[ "$DELETE_STATUS" == "204" || "$DELETE_STATUS" == "200" ]]; then
    pass "DELETE container HTTP ${DELETE_STATUS}"
    CONTAINER_ID=""  # ล้างเพื่อไม่ให้ cleanup ลบซ้ำ
  else
    fail "DELETE container — HTTP ${DELETE_STATUS} (expected 204)"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo -e "\n══════════════════════════════════════"
if [[ "$FAILURES" -eq 0 ]]; then
  echo -e "${GREEN}🎉 Smoke Test PASSED${NC}"
else
  echo -e "${RED}💥 Smoke Test FAILED — ${FAILURES} step(s) failed${NC}"
fi
echo "══════════════════════════════════════"

exit "$FAILURES"
