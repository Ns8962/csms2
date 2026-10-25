# CSMS 2 — CS Management System (NestJS + React)

เขียนใหม่จาก https://csms.atiz.com · backend **NestJS 12** · frontend **React 19 + Vite + Tailwind 3 + lucide-react (ไอคอน)** · ฐานข้อมูลแอป **MongoDB `csms2`**

## ระบบเดิมทำอะไร (ผล reverse engineer)

- SPA React (Vite) ไฟล์เดียว เสิร์ฟจาก Express ตัวเดียวกับ API · login เช็กในเบราว์เซอร์ (username/password ฝังอยู่ใน JS) · API ไม่มีการยืนยันตัวตน
- เป็นเครื่องมือ CS แก้ข้อมูล **มัดจำ** ของ DreaseV2 บน MongoDB ที่เครื่องสาขา (เลือกด้วย IP, รายชื่อ IP มาจาก Google Sheet ~670 สาขา)
- มี 3 เมนู (clone เพิ่มเมนูที่ 4 "แก้ไข DF" ซึ่งเว็บเดิมไม่มี ดูตารางด้านล่าง):

| เมนู | ทำอะไร | API |
|---|---|---|
| คืนยอดมัดจำ | ค้นมัดจำด้วย HN / Invoice แล้วแก้ `amount_current` | `POST /search`, `POST /update` |
| รายการมัดจำไม่แสดง | ค้นบิลด้วย Invoice เลือกรายการมัดจำในบิล แล้วสร้างแถวมัดจำที่ระบบไม่สร้างให้ | `POST /search-bills`, `POST /create-deposit` |
| ลบรายการมัดจำ | ค้นมัดจำด้วย HN แล้วลบ | `POST /search-deposits`, `POST /delete-deposit` |
| **แก้ไข DF** (เมนูใหม่) | ค้นบิลด้วย HN + Invoice (ต้องกรอกทั้งคู่) เลือกแถว DF ของบิล (บิลที่มีแถวเดียวเลือกให้เอง) กรอกจำนวน DF แล้วบันทึก | `POST /df/search`, `POST /df/update` |
| (ทุกหน้า) | เลือก IP สาขา + ปุ่ม Check | `GET /ip-list`, `POST /refresh-ip-list`, `POST /connect` |

clone ใช้ชื่อ endpoint และรูปแบบ response เดิมทั้งหมด (Decimal128 ยังออกมาเป็น `{"$numberDecimal": "..."}`) แต่อยู่ใต้ `/api` และต้องมี token

## โครงสร้าง

```
backend/   NestJS (ESM)
  src/auth        POST /api/auth/login, GET /api/auth/me (bcrypt + JWT)
  src/users       users + seed จาก .env
  src/branches    GET /api/ip-list, POST /api/refresh-ip-list (Google Sheet CSV / JSON)
  src/clinic      POST /api/connect + connection pool ต่อ IP สาขา
  src/deposits    search, update, search-bills, create-deposit, search-deposits, delete-deposit
  src/df          POST /api/df/search, POST /api/df/update (แก้ไข DF)
  src/audit       audit_logs ของทุกการแก้ไข
  src/scripts     seed-demo-clinic.ts (ข้อมูลทดลอง), import-branches.ts (โหลดรายการ IP จากไฟล์ CSV/JSON)
frontend/  React + Vite + Tailwind 3 + lucide-react
  src/components  IconInput (ช่องกรอกมีไอคอน), PageHeader (หัวข้อหน้า), InfoRow (บรรทัดในการ์ด), ServerStatus, IpPicker
  src/pages       DepositReturn, DepositLost, DepositRemove, DfEdit (ไอคอนเมนูข้างกับไอคอนหัวข้อหน้าใช้ตัวเดียวกัน)
  src/changelog.ts  ข้อความในป้าย "Update vX" และหน้าต่างประกาศ (ปัจจุบัน v1.2) · ออกเวอร์ชันใหม่: เพิ่มรายการไว้บนสุด แล้วแก้ version ใน package.json ของ backend และ frontend (`npm version X.Y.0 --no-git-tag-version`)
export/    export-servers.mjs ดึง name,ip จาก AtizDevTool → servers.csv (เฉพาะที่ Enable), servers-all.csv (ทั้งหมด) · ไฟล์ CSV อยู่ใน .gitignore (เป็นรายชื่อโครงสร้างภายใน) สร้างใหม่ในเครื่องด้วยสคริปต์นี้
```

## รันบนเครื่อง (dev)

ต้องมี Node 22+ และ MongoDB ที่ `127.0.0.1:27017` (เครื่องนี้มี service `MongoDB50` อยู่แล้ว)

```powershell
# 1) backend
cd backend
npm install
copy .env.example .env      # เฉพาะเมื่อยังไม่มี .env: แก้ JWT_SECRET, SEED_PASSWORD และตั้ง CLINIC_DB_NAME=csms2_demo_clinic
npm run seed:demo           # สร้าง DB ทดลอง csms2_demo_clinic + เพิ่ม 127.0.0.1 ในรายการ IP
npm run start:dev           # http://localhost:3000/api

# 2) frontend (อีก terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxy /api ไป :3000)
```

Login ด้วย user / รหัสผ่านจาก `SEED_USERNAMES` / `SEED_PASSWORD` ใน `backend/.env` (สร้างให้ตอน backend เริ่มครั้งแรก) → พิมพ์ IP `127.0.0.1` (หรือเลือก "Local demo clinic" ถ้ายังอยู่ในรายการ) → Check → ลอง

- คืนยอดมัดจำ: HN `HN6900001` หรือ Invoice `6900001`
- รายการมัดจำไม่แสดง: Invoice `6900002` หรือ `6900005`
- ลบรายการมัดจำ: HN `HN6900002`
- แก้ไข DF: HN `HN6900001` + Invoice `690000700` (แถวเดียว DF 0) · HN `HN6900002` + `690000755` (หลายแถว: อุดฟัน / ขูดหินปูน / ถอนฟันที่ยกเลิกแล้วจะไม่แสดง) · HN `HN6900001` + `690000800` (บิลที่ถูกลบ แก้ไม่ได้)

รัน `npm run seed:demo` ซ้ำเมื่อไหร่ก็ได้เพื่อรีเซ็ตข้อมูลทดลอง (สคริปต์ยอมลบเฉพาะ DB ที่ชื่อลงท้าย `_demo_clinic` บน localhost) · หลังโหลดรายการ server จริงเข้าไปแล้ว แถว "Local demo clinic" จะหายจากรายการ และ `seed:demo` จะเพิ่มกลับให้

## รายการ IP สาขา

รายการในปุ่ม "เลือกจากรายการ" เก็บใน `csms2.branches` ตอนนี้คือ 309 server ที่ Enable ใน AtizDevTool (ชื่อ server เป็น label) · ปุ่ม ↻ ในหน้าเว็บอ่านจาก `IP_LIST_SOURCE_URL` ซึ่งยังว่าง กดแล้วจะขึ้นข้อความและรายการเดิมไม่เปลี่ยน

```powershell
# 1) ดึง name,ip จาก AtizDevTool → export/servers.csv และ export/servers-all.csv (อ่านอย่างเดียว ไม่กดปุ่ม restart / clear log)
cd export
$env:ADMINTOOL_URL='https://<host ของ admin tool>'; $env:ADMIN_USER='...'; $env:ADMIN_PASS='...'; node export-servers.mjs

# 2) โหลดเข้า csms2.branches แทนที่รายการเดิมทั้งหมด (ถ้าไฟล์ไม่มี IPv4 ที่ถูกต้องเลยจะไม่แก้อะไร)
cd ../backend
npm run import:branches -- ../export/servers.csv
```

หยุด backend ก่อนรัน เพราะคำสั่งนี้ build ทับโฟลเดอร์ `dist` · CSV เป็นรายการโครงสร้างภายใน ไม่ควร commit หรือแชร์นอกทีม

## ต่อ server สาขาจริง

`backend/.env` ชี้ไป server สาขาจริง (ไม่ใช่เดโม): `CLINIC_MONGO_URI_TEMPLATE=mongodb://<user>:<password>@{ip}:27017/?authSource=admin` และ `CLINIC_DB_NAME=mris` · ถ้าจะทดลองกับข้อมูลเดโมให้สลับค่าตามบรรทัดคอมเมนต์ใน `.env`

ยืนยันแล้วกับสาขาตัวอย่าง 1 แห่ง: ล็อกอินได้ ฐานข้อมูลชื่อ `mris` Check ขึ้น "พร้อม" และค้นหาได้ สาขานี้ไม่มี collection `deposit_bills` เลย (ไม่เคยมีมัดจำ) ซึ่งไม่ใช่ปัญหา: MongoDB สร้าง collection ตอนเขียนครั้งแรก และเมนู "รายการมัดจำไม่แสดง" ก็สร้างแถวแรกให้ได้ Check จึงบังคับเฉพาะ `bills`

ความหมายของ "ไม่พร้อม" (ข้อความบนหน้าเว็บบอกสาเหตุ รายละเอียดเต็มอยู่ใน log ของ backend):
- `… ไม่ได้: หมดเวลา 5 วินาที …` = ไม่มีอะไรตอบกลับจากพอร์ต MongoDB เช่น firewall ของ server ทิ้งแพ็กเก็ต เจอกับหลายสาขา ทั้งที่ VPN ต่ออยู่และ SSH / HTTP เข้าได้
- `… ไม่ได้: เครื่องสาขาปฏิเสธการเชื่อมต่อ …` = เครื่องตอบแต่ MongoDB ไม่ได้เปิดพอร์ตนี้ (หรือใช้พอร์ตอื่น แก้ที่ `CLINIC_MONGO_URI_TEMPLATE`)
- `… ไม่ได้: ล็อกอิน MongoDB ไม่ผ่าน …` = user / password ใน `CLINIC_MONGO_URI_TEMPLATE` ใช้กับเครื่องนี้ไม่ได้ (ตัวอย่าง: Mongo ในเครื่องคุณ `127.0.0.1` ไม่มี user ที่ตั้งไว้ใน template)
- `ไม่พบ bills ในฐานข้อมูล …` = ต่อและล็อกอินได้ แต่ชื่อ DB (`CLINIC_DB_NAME`) ไม่ตรงกับเครื่องนั้น
- `ตรวจสอบฐานข้อมูลสาขา … ไม่สำเร็จ` = ต่อได้ แต่อ่านฐานข้อมูลไม่ผ่าน เช่น user ไม่มีสิทธิ์

backend ฟังเฉพาะ `127.0.0.1` (ตั้ง `HOST=0.0.0.0` ถ้าต้องให้เครื่องอื่นเข้า) เพราะ `.env` มีรหัส Mongo ของสาขา (ไฟล์ `.env` ไม่ถูก commit) · รหัส login ของเว็บเดิมเปิดเผยอยู่ใน JS ของเว็บนั้นมาก่อน จึงควรตั้ง `SEED_PASSWORD` ใหม่ ไม่ใช้รหัสเดียวกัน

### ผลสำรวจทั้ง 309 server (`export/fleet-check.csv`)

สำรวจแบบอ่านอย่างเดียว ขั้นตอนเดียวกับปุ่ม Check จากเครื่องที่ต่อ VPN: ต่อพอร์ต 27017 แล้วล็อกอินด้วยรหัสเดียวกันทั้งหมด

| ผล | แถว | ความหมาย |
|---|---|---|
| `ready` | 129 | Check ขึ้น "พร้อม" ใช้ได้ทันที (DB `mris`, Mongo 4.4.x, standalone) |
| `unreachable-timeout` | 178 | พอร์ต 27017 ไม่ตอบ = Single Tenant 108 (IP ภายใน) + Multi-Tenant 70 (9 IP ที่ใช้ร่วมกัน) สุ่มเช็ก 15 เครื่อง SSH และ HTTP ตอบหมด ไม่ใช่เครื่องดับหรือ VPN สาเหตุอยู่ที่ AWS Security Group (ดูด้านล่าง) |
| `unreachable-refused` | 1 | เครื่องตอบแต่ไม่มี Mongo ฟังที่ 27017 |
| `login-auth-failed` | 1 | ต่อได้แต่รหัสเดียวกันใช้ไม่ได้ |

รายชื่อ server รายตัวอยู่ใน `export/fleet-check.csv` และ `export/needs-fix-single-tenant.csv` ซึ่งสร้างในเครื่องและ **ไม่ถูก commit** (เป็นรายชื่อโครงสร้างภายใน)

- ใน 129 สาขาที่ติด มี 18 สาขามี `deposit_bills` (รวม 4,636 บิลที่มีรายการมัดจำ) ที่เหลือไม่เคยใช้มัดจำ · ไม่มีสาขาที่มีบิลมัดจำแต่ขาด collection
- **Multi-Tenant (70 แถว, 9 IP) ข้ามโดยตั้งใจ** ยังอยู่ในรายการเลือกแต่จะขึ้น "ไม่พร้อม" และไม่ได้เขียนโค้ดรองรับหลาย DB ต่อ IP (แอปใช้ `CLINIC_DB_NAME` ค่าเดียวต่อทุก server) ถ้าจะซ่อนออกจากรายการ ให้กรองแถวที่ IP ซ้ำออกจาก `export/servers.csv` แล้วรัน `npm run import:branches` ใหม่
- `fleet-check.csv` เป็นภาพรวม ณ 25 ต.ค. 2569 (สคริปต์สำรวจไม่ได้เก็บไว้ในโปรเจกต์) · `needs-fix-single-tenant.csv` คือรายชื่อ 110 server เดี่ยวที่ต้องแก้ แยกตามปัญหา

#### ทำไม 108 ตัวหมดเวลา (วินิจฉัยจากการล็อกอิน SSH อ่านอย่างเดียวกับ 4 เครื่อง)

- ทุกเครื่องเป็น AWS ap-southeast-7 (กรุงเทพ) VPC และ subnet เดียวกัน และตั้งค่าในตัวเครื่องเหมือนกันหมด: mongod ฟัง `0.0.0.0:27017`, `authorization: enabled`, `ufw` ปิด, iptables `INPUT ACCEPT`
- ต่างกันที่ **Security Group**: เครื่องที่ต่อได้ใช้ SG ตัวเดียวกันร่วมกัน ส่วนเครื่องที่ต่อไม่ได้แต่ละตัวมี SG ของตัวเอง (ตั้งชื่อรายคลินิก)
- วิธีแก้: เพิ่มกฎ inbound TCP 27017 จากวง VPN ให้ SG ของแต่ละเครื่องในรายการ ต้องใช้สิทธิ์ AWS (เครื่องที่พัฒนานี้ไม่มี AWS CLI / credentials) แล้วกด Check ใหม่ ไม่ต้องแก้โค้ดหรือ restart Mongo
- ข้อควรระวัง: เปิด Mongo ให้ทั้งวง VPN แปลว่าทุกคนที่ต่อ VPN ลองล็อกอิน Mongo ได้ ตอนนี้มี auth เปิดอยู่ทุกเครื่อง แต่ควรใช้ user เฉพาะ CSMS แทน root

## ขึ้น production

```powershell
cd frontend; npm run build          # → frontend/dist
cd ../backend; npm run build
node dist/main.js                   # เสิร์ฟทั้งหน้าเว็บ (/) และ API (/api) ที่พอร์ตเดียว เหมือนของเดิม
```

ค่าใน `backend/.env` ที่ต้องตั้ง:

| ตัวแปร | ค่า |
|---|---|
| `JWT_SECRET` | สุ่มใหม่ ≥ 32 ตัวอักษร |
| `SEED_PASSWORD` | รหัสผ่านใหม่ (ใช้ตอนสร้าง user ครั้งแรกเท่านั้น) |
| `CLINIC_DB_NAME` | ชื่อ DB ของ DreaseV2 บนเครื่องสาขา (dump ในเครื่องนี้ชื่อ `mris`) |
| `CLINIC_MONGO_URI_TEMPLATE` | เช่น `mongodb://user:pass@{ip}:27017/?authSource=admin` ถ้าสาขาต้องใช้รหัส |
| `IP_LIST_SOURCE_URL` | ลิงก์ CSV ของ Google Sheet (`.../export?format=csv&gid=...`) สำหรับปุ่ม ↻ |
| `TRUST_PROXY` | `1` ถ้าอยู่หลัง Cloudflare / reverse proxy |
| `HOST` | `0.0.0.0` ถ้าต้องให้เครื่องอื่นเข้าถึง (ค่าเริ่มต้น `127.0.0.1` = เครื่องนี้เท่านั้น) |

เครื่องที่รัน backend ต้องต่อพอร์ต MongoDB ของสาขาได้ (ของเดิมน่าจะ allowlist IP ของ server csms.atiz.com ไว้)

## ฐานข้อมูล `csms2`

| collection | เก็บ |
|---|---|
| `users` | `username`, `passwordHash` (bcrypt 12), `active`, `lastLoginAt` |
| `branches` | `ip`, `label`, `sort` — รายการ IP สาขา (ซ้ำได้เหมือนใน sheet) |
| `app_meta` | `key: "ip_list"` → เวลาที่โหลดรายการล่าสุด |
| `audit_logs` | `action` (`deposit.update` / `deposit.create` / `deposit.delete` / `df.update`), `username`, `clinicIp`, `clinicDb`, `documentId`, `before`, `after`, `requestIp`, `createdAt` |

## ข้อมูลที่แตะบนเครื่องสาขา (DreaseV2)

- `deposit_bills`: `hn`, `patient_name`, `name`, `deposit_no`, `bill_list_id`, `bill_id`, `amount_current`, `amount_defualt` (สะกดผิดตามของจริง), `active` (`"1"` / `"0"`), `note`, `created_at`
- `bills`: `invoice_no` (เลข 9 หลัก = 7 หลักที่เห็น + 2 หลักท้าย, บิลคอร์สขึ้นต้น `C`), `status` (`"delete"` = ลบแล้ว), `list[]` (`deposit_status: "1"` = รายการมัดจำ, `price_total`)
- update → `$set amount_current` · create → `insertOne` รูปแบบเดียวกับที่ DreaseV2 สร้าง · delete → `active: "0"`
- `doctorbills` (แก้ไข DF): แถว DF ของบิล เชื่อมกับ `bills` ด้วย `bill_id` · `status` (`"active"` / `"delete"` = ยกเลิก, แก้เฉพาะ `active`) · `cost_df`, `price_total` (Decimal128) · `payment_id` (ObjectId) · `title`, `officer_name`, `amount`, `order`
  - save → `$set { cost_df: DF, price_total: DF, payment_id: null }` กับแถวที่เลือกแถวเดียว (ไม่ใช่ทุกแถวของบิล เพราะบิลหนึ่งมีหลายแถว DF ได้ เช่น คนละหมอ/คนละหัตถการ) · ถ้าค่าเท่าเดิมและ `payment_id` เป็น null อยู่แล้วจะไม่เขียนอะไร
  - สเปกเดิมเขียนว่า `price_df` แต่ไม่มีฟิลด์นี้ในฐานข้อมูลที่ตรวจ (0 เอกสารใน 4 ฐานข้อมูล) ฟิลด์จริงคือ **`price_total`**
  - **`payment_id` ไม่ใช่การจ่าย DF ให้แพทย์**: ทุกแถว `active` ในฐานข้อมูลที่ตรวจมีค่านี้ และชี้ไปที่ `payment_summary._id` (ใบชำระเงินของบิล) ไม่พบใน `doctorfees` การล้างเป็น `null` ทำตามสเปก (ผมไม่เห็นกฎของ DreaseV2 ว่ามันมีผลอะไรต่อ) ค่าเดิมเก็บไว้ใน `audit_logs.before.payment_id` เสมอเพื่อกู้คืนได้

## ต่างจากของเดิม

- รหัสผ่านตรวจที่ server (bcrypt + JWT 8 ชม. เก็บใน sessionStorage) และจำกัด login 10 ครั้ง/นาที · เดิมรหัสผ่านอยู่ใน JS ให้ทุกคนเห็น
- ทุก API ต้องมี token · เดิมใครก็เรียก `/delete-deposit`, `/update` ได้จากอินเทอร์เน็ต
- ทุก request ส่ง `ip` ไปเอง · เดิม server จำ connection เดียวร่วมกันทุกคน ถ้า CS สองคนทำคนละสาขาพร้อมกันจะค้นข้อมูลผิดสาขา
- เปลี่ยน IP แล้วต้องกด Check ใหม่ และผลค้นหาเดิมถูกล้าง
- แก้มูลค่า: ต้องเป็นตัวเลข 0 ถึงมูลค่าที่ซื้อ และไม่เขียนทับถ้ามีคนแก้ไปก่อน
- สร้างมัดจำ: ใช้ชื่อ/ราคาจากบิลในฐานข้อมูล (ไม่เชื่อค่าจากเบราว์เซอร์) · ข้ามบิลที่ลบแล้ว · กันสร้างซ้ำ และบอก "(มีรายการมัดจำแล้ว)" ในรายการ
- ลบมัดจำ: มีกล่องยืนยัน และเป็น soft delete (`active: "0"`) กู้คืนได้
- บันทึก audit log ทุกการแก้ไข
- เลข Invoice: ตัด 2 หลักท้ายเฉพาะเลข 9 หลัก (ของเดิมตัดทุกเลข ทำให้บิล 7 หลักแสดงผิด)
- แสดงข้อความเมื่อค้นไม่เจอ และเหตุผลเมื่อ "ไม่พร้อม"
- กด Enter เพื่อ login ได้

## ยังต้องยืนยัน

- ชื่อ DB / user / password ของ MongoDB สาขา: ใช้ DB `mris` (user ระดับ root) สำรวจแล้ว 129 สาขาที่ต่อได้ ทุกตัวใช้ DB `mris` และรหัสเดียวกัน (ยกเว้น 1 สาขาที่รหัสไม่ผ่าน) · ควรสร้าง user เฉพาะ CSMS แทน root
- ปุ่ม ↻ ในหน้าเว็บยังเขียนว่า "โหลดรายการใหม่จาก Google Sheet" และใช้ได้เมื่อตั้ง `IP_LIST_SOURCE_URL` เท่านั้น (ตอนนี้โหลดรายการด้วย `npm run import:branches` แทน)
- ของเดิมลบมัดจำแบบลบจริงหรือ soft delete และ `/search` กรอง HN กับ Invoice แบบ AND หรือ OR (clone ใช้ soft delete และ AND)
