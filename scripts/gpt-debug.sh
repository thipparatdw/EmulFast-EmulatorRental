#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/_common.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <log-file>"
  exit 1
fi

LOG_FILE="$1"
if [[ ! -f "${LOG_FILE}" ]]; then
  echo "Log file not found: ${LOG_FILE}"
  exit 1
fi

require_cmd curl
require_cmd jq
require_env OPENAI_API_KEY

OPENAI_API_BASE="${OPENAI_API_BASE:-https://api.openai.com/v1}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
DEBUG_LOG_TAIL_LINES="${DEBUG_LOG_TAIL_LINES:-350}"

TS="$(timestamp_now)"
BASENAME="$(basename "${LOG_FILE}")"
OUT_FILE="${ROOT_DIR}/docs/debug/${TS}-${BASENAME}.md"
ensure_parent_dir "$OUT_FILE"

LOG_CONTENT="$(tail -n "${DEBUG_LOG_TAIL_LINES}" "${LOG_FILE}")"

read -r -d '' PROMPT <<EOF || true
You are a debugging assistant for EmulFast (TypeScript monorepo with Next.js + NestJS + Prisma).

Analyze the log and return:
1) Root cause (1-2 sentences)
2) Most likely files/symbols to inspect
3) Minimal safe fix steps
4) Regression tests to add

Constraints:
- Do not suggest breaking API contract changes unless necessary.
- Prioritize smallest diff and low-risk fixes.

Log:
${LOG_CONTENT}
EOF

PAYLOAD="$(jq -n \
  --arg model "${OPENAI_MODEL}" \
  --arg prompt "${PROMPT}" \
  '{
    model: $model,
    messages: [{role: "user", content: $prompt}],
    temperature: 0.1
  }')"

RESPONSE="$(curl -sS "${OPENAI_API_BASE}/chat/completions" \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")"

CONTENT="$(echo "${RESPONSE}" | jq -r '.choices[0].message.content // empty')"
if [[ -z "${CONTENT}" ]]; then
  echo "OpenAI response parse failed:"
  echo "${RESPONSE}" | jq .
  exit 1
fi

{
  echo "# GPT Debug Output"
  echo
  echo "- Timestamp: ${TS}"
  echo "- Model: ${OPENAI_MODEL}"
  echo "- Log file: ${LOG_FILE}"
  echo "- Tail lines: ${DEBUG_LOG_TAIL_LINES}"
  echo
  echo "${CONTENT}"
} | tee "${OUT_FILE}"

echo
echo "Saved: ${OUT_FILE}"
