---
description: เริ่ม phase ใหม่ของ EmulFast - lead วิเคราะห์ scope, แตก subtask, มอบหมายให้ subagents และอัปเดต phases.md
argument-hint: <phase-number 0-7>
allowed-tools: Read, Write, Edit, Glob, Grep, Task, TodoWrite
---

# /plan-phase $ARGUMENTS

คุณคือ **lead agent**. ผู้ใช้สั่งเริ่ม **Phase $ARGUMENTS** ของ EmulFast.

## ขั้นตอน

1. **อ่าน context ก่อน**:
   - `CLAUDE.md` (project memory)
   - `AGENTS.md` (workflow + escalation)
   - `docs/phases.md` (หา section ของ Phase $ARGUMENTS)
   - `docs/architecture.md` + `docs/api-contract.md` (ถ้ามี)
   - `docs/token-budget.md` (cumulative)

2. **วิเคราะห์ scope ของ Phase $ARGUMENTS**:
   - อ่าน scope ที่ระบุใน `docs/phases.md`
   - ตรวจสอบ dependency จาก phase ก่อนหน้า (ต้อง done ก่อน)
   - ถ้ามี dependency ค้าง → หยุด, รายงาน User
   - ระบุ deliverables เป็น checklist ที่วัดได้

3. **แตก subtask** เป็น todo list (ใช้ `TodoWrite`):
   - 1 todo = 1 deliverable ที่ตรวจสอบได้
   - เรียงตาม dependency
   - กำหนด owner agent ที่ชัดเจนสำหรับแต่ละ todo

4. **เลือก agent + เขียน prompt**:
   - ใช้ Decision Tree ใน `AGENTS.md` ตัดสินใจ
   - สำหรับงานออกแบบ schema/contract → `architect` (Opus, ใช้ครั้งเดียวให้คุ้ม)
   - สำหรับงาน implement → `backend` / `frontend` / `devops`
   - แต่ละ subtask → ใช้ `Task` tool เรียก subagent ตาม template ใน `lead.md`

5. **Execute loop**:
   - ทำ subtask ทีละตัว (in_progress 1 ตัวเสมอ)
   - หลัง subagent ส่งผล → อ่านไฟล์ที่แก้ → mark todo done
   - ถ้า fail → ส่งกลับพร้อม hint

6. **QA Gate** (ก่อนจบ phase):
   - เรียก `qa` agent รัน `pnpm lint && pnpm typecheck && pnpm test`
   - ถ้า fail → ส่งกลับ owner agent แก้, loop จนผ่าน

7. **Report**:
   - เรียก `reporter` agent อัปเดต `docs/phases.md` + `docs/token-budget.md`

8. **สรุปให้ User**:
   - ใช้ Output Format ใน `lead.md`
   - รอ User อนุมัติก่อนไป phase ถัดไป

## ห้าม

- ห้ามเขียนโค้ดเอง — ใช้ subagents เท่านั้น
- ห้ามข้าม QA gate
- ห้ามเริ่ม phase $ARGUMENTS+1 โดยไม่มี approval

## เริ่มเลย

หลังอ่าน context เสร็จ → สรุปแผน Phase $ARGUMENTS เป็น bullet สั้น ๆ ก่อน execute เพื่อให้ User confirm scope (ถ้ามี ambiguity)
