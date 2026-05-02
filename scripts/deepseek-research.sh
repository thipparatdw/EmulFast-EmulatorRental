#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/_common.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"research question from lead\""
  exit 1
fi

QUESTION="$1"
require_cmd curl
require_cmd jq
require_env DEEPSEEK_API_KEY

DEEPSEEK_API_BASE="${DEEPSEEK_API_BASE:-https://api.deepseek.com/v1}"
DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-chat}"

TS="$(timestamp_now)"
TOPIC="$(slugify "$QUESTION")"
OUT_FILE="${ROOT_DIR}/docs/research/${TS}-${TOPIC}.md"
ensure_parent_dir "$OUT_FILE"

read -r -d '' PROMPT <<EOF || true
Research task for EmulFast (Demo).

Question:
${QUESTION}

Project context:
- Linux-hosted Android emulator rental system
- Redroid + ws-scrcpy
- Stack: Next.js + NestJS + PostgreSQL + Redis

Output format (strict):
## Research Brief: <topic>
### Summary (5 bullets)
### Recommended for EmulFast Demo
- Option A: ...
- Option B: ...
### Risks / Gotchas
### References
### Questions for User (max 2)
EOF

PAYLOAD="$(jq -n \
  --arg model "${DEEPSEEK_MODEL}" \
  --arg prompt "${PROMPT}" \
  '{
    model: $model,
    messages: [{role: "user", content: $prompt}],
    temperature: 0.2
  }')"

RESPONSE="$(curl -sS "${DEEPSEEK_API_BASE}/chat/completions" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")"

CONTENT="$(echo "${RESPONSE}" | jq -r '.choices[0].message.content // empty')"
if [[ -z "${CONTENT}" ]]; then
  echo "DeepSeek response parse failed:"
  echo "${RESPONSE}" | jq .
  exit 1
fi

{
  echo "# DeepSeek Research Output"
  echo
  echo "- Timestamp: ${TS}"
  echo "- Model: ${DEEPSEEK_MODEL}"
  echo "- Question: ${QUESTION}"
  echo
  echo "${CONTENT}"
} | tee "${OUT_FILE}"

echo
echo "Saved: ${OUT_FILE}"
