---
description: ส่งงานข้าม agent ผ่าน lead (แทนการคุยตรง) - lead จะรวบรวม context, อัปเดต api-contract.md, แล้ว delegate ต่อ
argument-hint: <from-agent>-><to-agent> <task-description>
allowed-tools: Read, Edit, Glob, Grep, Task, TodoWrite
---

# /handoff $ARGUMENTS

คุณคือ **lead agent**. ผู้ใช้ขอ handoff ระหว่าง agent.

## รูปแบบ argument

```
<from>-><to> <description>
```

ตัวอย่าง:
- `backend->frontend นำ endpoint /api/packages ไปใช้ในหน้า /packages`
- `architect->backend ใช้ schema Payment ที่อัปเดตใน Prisma เพื่อสร้าง PaymentModule`
- `devops->backend orchestrator API พร้อมแล้วที่ http://orchestrator:5000`

## ขั้นตอน

1. **Parse argument** → ระบุ `from`, `to`, `description`

2. **รวบรวม context จาก `from`**:
   - อ่านไฟล์ที่ `from` เพิ่ง edit (ใช้ `Glob` หา file ที่ modified ล่าสุด)
   - สรุปการเปลี่ยนแปลง 5-8 bullet
   - หาเอกสารที่เกี่ยวข้อง: `docs/api-contract.md`, `docs/architecture.md`

3. **อัปเดต contract** (ถ้าจำเป็น):
   - ถ้า `from` เพิ่ม/แก้ API endpoint → อัปเดต `docs/api-contract.md`
   - ถ้า `from` เพิ่ม schema field → อัปเดต `docs/architecture.md` section "Data Model"

4. **เขียน prompt ให้ `to`**:
   - ใช้ template ใน `.claude/agents/lead.md` section "Prompt Template"
   - ระบุ:
     - context สรุป (ไม่ใช่ raw output)
     - files ที่ต้องอ่านก่อน
     - acceptance criteria
     - constraints (zone ที่แก้ได้/ไม่ได้)

5. **Delegate via `Task` tool** → subagent_type = `<to>`

6. **รับผล + QA Gate**:
   - เรียก `qa` ตรวจ
   - ถ้า fail → ส่งกลับ `to` แก้

7. **Report**:
   - เรียก `reporter` อัปเดต progress
   - สรุปให้ User

## หลักการ

- **ห้าม subagent คุยกันตรง** — ทุก handoff ต้องผ่าน command นี้ (lead เป็น mediator)
- **ห้าม dump ทั้ง output ของ `from`** ให้ `to` — สรุปเสมอ (ลด token)
- **อัปเดต contract เป็น single source of truth** — `from` ไม่ต้องอธิบายซ้ำใน prompt ของ `to`

## Output

```markdown
## Handoff: <from> → <to>
**Task**: <description>

### Context รวบรวมจาก <from>
- ...

### Contract updates
- `docs/api-contract.md`: <section>

### Prompt ส่งให้ <to>
<embedded ใน Task tool — ไม่ต้อง echo>

### Status
- ✅ Delegated, รอผล
```
