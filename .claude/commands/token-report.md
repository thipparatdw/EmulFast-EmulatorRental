---
description: รายงาน token cost ปัจจุบัน - reporter อ่าน docs/token-budget.md และสรุปเทียบ budget
argument-hint: [phase-number] (optional - ถ้าไม่ใส่ = ทั้งโปรเจกต์)
allowed-tools: Read, Edit, Glob, Grep
---

# /token-report $ARGUMENTS

คุณคือ **reporter agent** (Haiku). ผู้ใช้ขอรายงาน token cost.

## ขั้นตอน

1. **อ่าน `docs/token-budget.md`** ทั้งไฟล์

2. **คำนวณ**:
   - ถ้า `$ARGUMENTS` = phase number → กรองเฉพาะ phase นั้น
   - ถ้าไม่มี argument → รวมทั้งโปรเจกต์
   - แยกตาม agent: lead, architect, backend, frontend, devops, qa, reporter
   - แยก input vs output tokens

3. **เทียบ budget** ใน `CLAUDE.md` section "Token Budget":
   - Phase 0: 80–120k
   - Phase 1: 100–150k
   - Phase 2: 120–180k
   - Phase 3: 80–120k
   - Phase 4: 100–140k
   - Phase 5: 80–120k
   - Phase 6: 100–140k
   - Phase 7: 60–100k

4. **สถานะ**:
   - 🟢 < 60% ของ budget → on track
   - 🟡 60–80% → watch
   - 🔴 > 80% → alert User

## Output Format

### กรณี รายงานทั้งโปรเจกต์

```markdown
## Token Report — รวมทั้งโปรเจกต์

| Phase | ใช้ไป | Budget | % | สถานะ |
|---|---|---|---|---|
| 0 | 95k | 80–120k | 79% | 🟡 |
| 1 | 0 | 100–150k | 0% | ⚪ ยังไม่เริ่ม |
| ... |

**รวมทั้งหมด**: ~95k / ~720–1,070k tokens (~10%)

### Top 3 agents ที่ใช้
1. backend: 45k (47%)
2. architect: 25k (26%)
3. frontend: 15k (16%)

### คำแนะนำ
- ...
```

### กรณี รายงาน phase เดียว

```markdown
## Token Report — Phase $ARGUMENTS

**Phase X**: <name>
**ใช้ไป**: 95k tokens
**Budget**: 80–120k
**สถานะ**: 🟡 79%

### แยกตาม agent
| Agent | Tokens | % |
|---|---|---|
| backend | 45k | 47% |
| architect | 25k | 26% |
| ... |

### Top 3 tasks
1. <task name> — Xk tokens
2. ...

### คำแนะนำ
- ถ้าเหลือ < 20% ของ budget → ลด context, ใช้ Haiku สำหรับ summary
```

## ห้าม

- ห้ามแก้ไฟล์โค้ด
- ห้ามคำนวณ token แบบเดา — ใช้ตัวเลขจริงใน `docs/token-budget.md`
- ถ้าไฟล์ว่าง/ยังไม่มีข้อมูล → ตอบ "ยังไม่มี data — เริ่ม Phase 0 ก่อน"
