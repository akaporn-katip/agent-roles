# agent-roles

Paseo plugin + Pi extension ที่ให้ agent แต่ละ "Role" มี system prompt และข้อจำกัด tool ของตัวเอง
ปิดช่องว่างที่ agent profile ของ Paseo ไม่มีช่อง system prompt และ Pi ไม่มี mode แบบ read-only

ปัญหาที่แก้: orchestrator (Planner) ชอบลงมือ implement เองแทนที่จะส่งต่อให้ worker
วิธีแก้: ตัดความสามารถทิ้ง ไม่ใช่สั่งห้าม Planner จะไม่เห็น tool `edit`/`write` และ bash ใช้ได้เฉพาะคำสั่งอ่าน

## ส่วนประกอบ

| ส่วน | ไฟล์ | ทำอะไร |
| --- | --- | --- |
| Paseo plugin (daemon) | `server/hooks.ts` | ดัก `agent.create` และ `agent.session_open` จับคู่ agent กับ Role แล้วใส่ system prompt + env |
| กฎจับคู่ | `shared/roles.ts` | schema ของ Role และฟังก์ชัน `resolveRole` (regex บน title, model, provider, cwd) |
| หน้าจอ | `client/roles.tsx` | sidebar "Agent roles" แสดง Role ที่โหลดอยู่ |
| Pi extension | `pi-extension/paseo-roles.js` | อ่าน env `PASEO_ROLE*` แล้วเอา tool ที่ห้ามออก + block bash ที่เขียนไฟล์ |
| config | `~/.paseo/agent-roles.json` | Role ทั้งหมด แก้แล้วมีผลกับ agent ตัวถัดไปทันที |

## ติดตั้ง

```sh
npm install
npm run typecheck
cp agent-roles.example.json ~/.paseo/agent-roles.json   # แล้วแก้ให้ตรงกับ profile ของคุณ
npm run install:pi-extension                              # คัดลอกไป ~/.pi/agent/extensions/
/opt/Paseo/resources/bin/paseo plugin install "$(pwd)"
/opt/Paseo/resources/bin/paseo plugin ls
```

แก้โค้ด plugin แล้วต้อง `paseo plugin reload agent-roles` แก้ `agent-roles.json` ไม่ต้อง

## Role ตรงกับ agent ไหน

Paseo ไม่บอก plugin ว่า agent ถูกสร้างจาก profile ไหน จึงจับคู่จากสิ่งที่เห็นได้คือ `title`, `model`, `provider`, `cwd`
ตัวอย่างใน `agent-roles.example.json` ใช้ model: profile Planner ใช้ fable ส่วน Coder ใช้ opus
ถ้าสอง profile ใช้ model เดียวกัน ให้แยกด้วย title แทน (ตั้งชื่อ agent ขึ้นต้นด้วย "Planner")
หรือใช้ `cwd` แยก main checkout กับ worktree เช่น `"cwd": "\\.paseo/worktrees/"` สำหรับ coder

## กลไก

1. Paseo เรียก hook `agent.create` → plugin ต่อ system prompt ของ Role เข้า config และตั้ง env
   `PASEO_ROLE`, `PASEO_ROLE_DENY_TOOLS`, `PASEO_ROLE_BASH`
2. Paseo spawn Pi พร้อม env นั้น (ยืนยันจากโค้ด provider ของ Paseo)
3. Pi โหลด `~/.pi/agent/extensions/paseo-roles.js` ซึ่งเอา tool ที่ห้ามออกจากรายการที่โมเดลเห็น
   และ block การเรียกที่หลุดมาพร้อมข้อความบอกให้ส่งต่องาน
4. ตอน resume หลัง daemon restart hook `agent.session_open` ใส่ env ซ้ำให้

Pi ที่รันเองนอก Paseo ไม่มี `PASEO_ROLE` extension จึงไม่ทำอะไร
