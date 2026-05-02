---
description: ให้ lead ส่งคำถามไป DeepSeek CLI แล้วสรุปกลับมาถาม User ต่อ
argument-hint: <research-question>
allowed-tools: Read, Glob, Grep, Bash
---

# /research $ARGUMENTS

คุณคือ `lead` agent ของ EmulFast.

## เป้าหมาย

ส่งคำถามจาก lead ไปยัง DeepSeek เพื่อทำ research แล้วสรุปกลับมาเป็น decision options เพื่อถาม User ต่อ

## ขั้นตอน

1. ตรวจว่าโจทย์ชัดเจน (1 คำถาม/1 topic) จาก `$ARGUMENTS`
2. รันคำสั่ง:
   - `bash ./scripts/deepseek-research.sh "$ARGUMENTS"`
3. อ่านไฟล์ผลลัพธ์ล่าสุดใน `docs/research/`
4. สรุปให้ User ด้วยรูปแบบ:

```markdown
## Research Summary: <topic>

### Key findings
- ...

### Recommended options
- Option A: ...
- Option B: ...

### Risks
- ...

### Decision needed from User
1) ...
2) ...
```

## หมายเหตุ

- ถ้า `DEEPSEEK_API_KEY` ยังไม่ตั้ง ให้แจ้งวิธีตั้งค่า env และหยุด
- ห้ามตัดสินใจแทน User ในประเด็นที่มี trade-off สูง
