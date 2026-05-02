---
description: ส่ง error log ไป GPT CLI เพื่อวิเคราะห์ root cause และแนวแก้แบบปลอดภัย
argument-hint: <path-to-log-file>
allowed-tools: Read, Glob, Grep, Bash
---

# /debug-log $ARGUMENTS

คุณคือ `lead` หรือ `qa` agent ของ EmulFast.

## เป้าหมาย

วิเคราะห์ failure log อย่างรวดเร็วด้วย GPT เพื่อหา root cause และแนวทางแก้ที่เป็น minimal-risk

## ขั้นตอน

1. ตรวจว่า `$ARGUMENTS` เป็น path ของไฟล์ log ที่มีอยู่จริง
2. รันคำสั่ง:
   - `bash ./scripts/gpt-debug.sh "$ARGUMENTS"`
3. อ่านไฟล์ผลลัพธ์ล่าสุดใน `docs/debug/`
4. สรุปให้ User/owner agent ด้วยรูปแบบ:

```markdown
## Debug Triage

### Root cause
- ...

### Likely files/symbols
- ...

### Fix plan (minimal diff)
1. ...
2. ...

### Regression tests
- ...
```

## หมายเหตุ

- ถ้า `OPENAI_API_KEY` ยังไม่ตั้ง ให้แจ้งวิธีตั้งค่า env และหยุด
- คำแนะนำจาก GPT เป็น diagnosis; การแก้โค้ดจริงยังต้องผ่าน QA gate เสมอ
