---
description: รัน QA gate + reporter + ส่ง User approve - ใช้ก่อนปิดทุก task ที่ส่งมอบ
argument-hint: [task-description] (optional)
allowed-tools: Read, Edit, Glob, Grep, Task, TodoWrite
---

# /ship $ARGUMENTS

คุณคือ **lead agent**. ผู้ใช้ขอ "ship" — ปิด task ปัจจุบันและส่ง User อนุมัติ.

## ขั้นตอน (เคร่งครัด ห้ามข้าม)

### 1. ตรวจสอบสถานะ todo
- อ่าน todo list ปัจจุบัน
- ถ้ามี todo ที่ยัง `in_progress` หรือ `pending` ใน scope ของ task นี้ → **หยุด**, แจ้ง User ว่ายังไม่พร้อม ship

### 2. QA Gate
- เรียก `qa` agent ผ่าน `Task` tool
- prompt: "รัน standard gate (lint + typecheck + test) สำหรับการเปลี่ยนแปลงทั้งหมดใน session นี้"
- รอผล:
  - ✅ PASS → ไปขั้นถัดไป
  - ❌ FAIL → ระบุ owner agent → ส่งกลับให้แก้ → loop จนผ่าน
- ถ้า loop เกิน 3 รอบ → หยุด, รายงาน User

### 3. Update docs
- เรียก `reporter` agent ผ่าน `Task` tool
- ขอให้:
  - อัปเดต `docs/phases.md` (mark checklist ที่ทำเสร็จ)
  - อัปเดต `docs/token-budget.md` (เพิ่ม row สรุป session นี้)
  - เขียน entry ใน `docs/CHANGELOG.md` (ถ้าจบ phase)

### 4. สรุปให้ User
ใช้ Output Format ด้านล่าง:

```markdown
## 🚢 Ship: <task / phase>

### สิ่งที่ทำเสร็จ
- ...
- ...

### ไฟล์ที่เปลี่ยน (สรุป)
| Path | Reason |
|---|---|
| `apps/api/src/...` | <reason> |
| ... |

### QA Gate
- Lint: ✅ / Typecheck: ✅ / Test: ✅ (N passed)
- Build: ✅ (api, web)

### Token Usage (session นี้)
- รวม: ~Xk tokens
- แยก: architect Yk / backend Zk / frontend Wk / qa Vk / reporter Uk

### Cumulative Phase Budget
- Phase X: ~XXk / YY-ZZk (P%) 🟢/🟡/🔴

### ต้องการ User decision
- [ ] อนุมัติให้ merge / ขึ้น phase ถัดไป
- [ ] หรือต้องการแก้อะไรเพิ่ม

### Next suggested action
- `/plan-phase <N+1>` หรือ ...
```

### 5. รอ User confirm
- ห้าม auto-merge / push ไปยัง remote
- ห้ามเริ่ม phase ใหม่ทันที — รอ User อนุมัติ

## ห้าม

- ❌ ห้ามข้าม QA gate
- ❌ ห้ามแก้ผล qa / reporter
- ❌ ห้ามตอบสั้นเกินไป — User ต้องเห็น checklist ครบ
- ❌ ห้ามเขียน "All good" โดยไม่มีตัวเลขรองรับ
