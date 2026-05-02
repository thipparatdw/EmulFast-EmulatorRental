# EmulFast — Prisma Schema Design v1 (Phase 0)

> Design doc สำหรับ `packages/db/prisma/schema.prisma`. Backend agent นำไฟล์นี้ไปสร้าง `schema.prisma` จริง + migration ครั้งแรก
>
> **เฉพาะ `architect` agent อัปเดตได้** (lead สั่ง). ไม่ใช่ contract ของ runtime — runtime ใช้ Prisma client ที่ generate มาจาก schema จริง

## Conventions (สำคัญ — ทุกตารางต้องตาม)

| หัวข้อ | กฎ |
|---|---|
| Naming | `PascalCase` สำหรับ model, `camelCase` สำหรับ field |
| Money (THB) | `Decimal @db.Decimal(12, 2)` — รองรับยอดจนถึง 9,999,999,999.99 |
| Money (Fcoin) | `Decimal @db.Decimal(18, 4)` — รองรับ fractional Fcoin |
| Time | `DateTime` เก็บ UTC; UI แปลง `Asia/Bangkok` |
| Required timestamps | ทุก model ต้องมี `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt` |
| Soft delete | `deletedAt DateTime?` (เฉพาะ User, Order, Emulator, SupportTicket) |
| Audit | ตารางที่กระทบเงิน/role: `createdById String?`, `updatedById String?` (FK → User; `onDelete: SetNull`) |
| ID | `String @id @default(cuid())` (cuid v1 — สั้น, sortable, URL-safe) |
| Enums | ใช้ Prisma enum เสมอ; ห้าม string ลอย |
| Relation FK | ระบุ `onDelete` ทุกครั้ง — default policy ใน design doc นี้คือ **Restrict สำหรับ financial-impact tables** |
| Index | ทุก FK + `userId` + `status` + `createdAt` ที่ใช้ใน WHERE/ORDER BY |
| i18n | ห้ามเก็บข้อความผู้ใช้ลง DB เป็นภาษาเดียว — ใช้ `messageKey` + `metadata Json?` แทน |

---

## Enums

```prisma
enum Role {
  user
  staff
  admin
}

enum UserStatus {
  active
  suspended
  banned
}

enum EmulatorStatus {
  provisioning   // กำลังสร้าง container
  running        // ใช้งานได้
  stopping       // กำลังหยุด (graceful)
  stopped        // หยุดแล้ว (ยังไม่หมดอายุ)
  expired        // หมดอายุ → cleanup ภายหลัง
  failed         // boot fail
  terminated     // ถูกลบ (final state)
}

enum OrderType {
  emulator_purchase
  emulator_renewal
  wallet_topup
}

enum OrderStatus {
  pending          // สร้างแล้ว รอจ่าย
  awaiting_payment // ส่ง gateway แล้ว รอ webhook
  paid             // จ่ายสำเร็จ
  failed           // จ่ายล้มเหลว / timeout
  cancelled        // user cancel
  refunded         // คืนเงินแล้ว
}

enum PaymentStatus {
  pending
  succeeded
  failed
  refunded
}

enum PaymentGateway {
  stripe       // card
  omise        // promptpay
  fcoin        // internal wallet
  manual       // admin adjust (เช่น refund)
}

enum PaymentMethod {
  card
  promptpay
  fcoin
}

enum WalletTxType {
  topup           // เติมเงินจาก gateway
  spend           // จ่ายค่า package
  refund          // คืนจาก order
  reward          // ได้จาก redeem reward
  promo_credit    // โปรโมชั่นแจก
  adjustment      // admin ปรับ (มี note บังคับ)
}

enum WalletTxDirection {
  credit   // +balance
  debit    // -balance
}

enum PromocodeType {
  percent       // ลด %
  fixed         // ลดจำนวนคงที่ (THB)
  fcoin_grant   // แจก Fcoin
}

enum MembershipTierCode {
  bronze
  silver
  gold
  platinum
}

enum RewardType {
  fcoin           // Fcoin grant
  discount_code   // generate promocode ส่วนตัว
  free_days       // ต่ออายุ emulator ฟรี N วัน
  physical        // ของรางวัลกายภาพ (Phase ภายหลัง)
}

enum RewardRedemptionStatus {
  pending     // รอ admin approve (ถ้าจำเป็น)
  fulfilled   // แจกสำเร็จ
  cancelled
  expired
}

enum TicketStatus {
  open
  pending_user      // รอ user ตอบ
  pending_staff     // รอ staff
  resolved
  closed
}

enum TicketChannel {
  bot      // chatbot ตอบอัตโนมัติ
  staff    // escalate ไปยังเจ้าหน้าที่
}

enum TicketPriority {
  low
  normal
  high
  urgent
}

enum SupportSenderType {
  user
  bot
  staff
  system
}
```

---

## Models

### 1. User

```prisma
model User {
  id              String       @id @default(cuid())
  email           String       @unique
  emailVerifiedAt DateTime?
  passwordHash    String       // argon2id
  phone           String?      @unique
  displayName     String
  avatarUrl       String?
  role            Role         @default(user)
  status          UserStatus   @default(active)
  locale          String       @default("th")    // 'th' | 'en'
  membershipTierId String?
  membershipPoints Int         @default(0)

  lastLoginAt     DateTime?
  lastLoginIp     String?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  deletedAt       DateTime?

  // Relations
  membershipTier  MembershipTier?       @relation(fields: [membershipTierId], references: [id], onDelete: SetNull)
  wallet          Wallet?
  emulators       Emulator[]
  orders          Order[]
  walletTxs       WalletTransaction[]
  redemptions     RewardRedemption[]
  tickets         SupportTicket[]       @relation("TicketOwner")
  assignedTickets SupportTicket[]       @relation("TicketAssignee")
  supportMessages SupportMessage[]
  feedbacks       Feedback[]

  @@index([role, status])
  @@index([membershipTierId])
  @@index([createdAt])
}
```

### 2. Package

```prisma
model Package {
  id            String   @id @default(cuid())
  code          String   @unique          // 'SFAST' | 'MFAST' (mapped via PackageCode enum ใน shared)
  nameKey       String                    // i18n key เช่น 'packages.sfast.name'
  descriptionKey String?
  androidVersion String                   // '10' | '12'
  cpuCores      Int
  ramMb         Int
  romGb         Int
  pricePerDay   Decimal  @db.Decimal(12, 2)   // THB/day
  pricePerMonth Decimal  @db.Decimal(12, 2)   // THB/month (default billing cycle)
  fcoinPerDay   Decimal  @db.Decimal(18, 4)   // ราคา Fcoin/day (ถ้าจ่ายด้วย Fcoin)
  isActive      Boolean  @default(true)
  sortOrder     Int      @default(0)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  orders        Order[]
  emulators     Emulator[]

  @@index([isActive, sortOrder])
}
```

### 3. Emulator

```prisma
model Emulator {
  id              String          @id @default(cuid())
  userId          String
  packageId       String
  orderId         String?         @unique             // order ที่สร้าง emulator นี้ (1:1)

  // Container metadata
  containerId     String?         @unique             // docker container id
  hostNode        String          @default("default") // เผื่อ multi-host ในอนาคต
  adbPort         Int?
  websocketPath   String?                             // '/ws/scrcpy/<id>'
  internalIp      String?

  status          EmulatorStatus  @default(provisioning)
  failureReason   String?                             // i18n key + json detail
  metadata        Json?                               // labels, tags

  expiresAt       DateTime                            // หมดอายุเมื่อไหร่ (UTC)
  lastHeartbeatAt DateTime?
  startedAt       DateTime?
  stoppedAt       DateTime?

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  deletedAt       DateTime?

  user            User            @relation(fields: [userId], references: [id], onDelete: Restrict)
  package         Package         @relation(fields: [packageId], references: [id], onDelete: Restrict)
  order           Order?          @relation("OrderToEmulator", fields: [orderId], references: [id], onDelete: SetNull)
  renewalOrders   Order[]         @relation("RenewalForEmulator")

  @@index([userId, status])
  @@index([status, expiresAt])
  @@index([hostNode, status])
  @@index([adbPort])
}
```

### 4. Order

```prisma
model Order {
  id              String       @id @default(cuid())
  orderNumber     String       @unique               // เช่น 'EF-202605-000123' (human-friendly)
  userId          String
  type            OrderType
  packageId       String?                            // null ถ้า type=wallet_topup
  emulatorId      String?                            // ถ้าเป็น renewal
  promocodeId     String?

  // Pricing snapshot (lock-in ตอน checkout)
  currency        String       @default("THB")       // 'THB' | 'FCOIN'
  subtotal        Decimal      @db.Decimal(12, 2)    // ก่อนหัก promo
  discount        Decimal      @default(0) @db.Decimal(12, 2)
  total           Decimal      @db.Decimal(12, 2)    // จำนวนที่ user จ่ายจริง
  fcoinAmount     Decimal?     @db.Decimal(18, 4)    // ถ้าจ่ายด้วย Fcoin

  paymentMethod   PaymentMethod
  status          OrderStatus  @default(pending)

  // Billing cycle (snapshot)
  billingDays     Int          @default(30)          // จำนวนวันที่ซื้อ
  expiresAt       DateTime?                          // เมื่อไหร่ pending จะ timeout

  // Audit
  createdById     String?                            // self หรือ admin (manual order)
  metadata        Json?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  deletedAt       DateTime?
  paidAt          DateTime?
  cancelledAt     DateTime?

  user            User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  package         Package?     @relation(fields: [packageId], references: [id], onDelete: Restrict)
  emulator        Emulator?    @relation("OrderToEmulator")
  renewalTarget   Emulator?    @relation("RenewalForEmulator", fields: [emulatorId], references: [id], onDelete: SetNull)
  promocode       Promocode?   @relation(fields: [promocodeId], references: [id], onDelete: SetNull)
  payment         Payment?
  walletTxs       WalletTransaction[]

  @@index([userId, status])
  @@index([status, createdAt])
  @@index([type, status])
  @@index([promocodeId])
}
```

### 5. Payment

```prisma
model Payment {
  id              String          @id @default(cuid())
  orderId         String          @unique
  gateway         PaymentGateway
  method          PaymentMethod
  status          PaymentStatus   @default(pending)

  amount          Decimal         @db.Decimal(12, 2) // THB ที่ charge จริง
  currency        String          @default("THB")

  // Gateway references
  gatewayChargeId String?         @unique             // Stripe charge id / Omise charge id
  gatewayIntentId String?                             // Stripe payment_intent (ถ้ามี)
  qrCodeUrl       String?                             // Omise PromptPay QR
  receiptUrl      String?

  // Webhook tracking
  webhookEventId  String?         @unique             // idempotency key จาก gateway
  failureCode     String?
  failureMessage  String?         // i18n key + raw

  rawPayload      Json?           // payload สุดท้ายจาก gateway (debug)

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  paidAt          DateTime?
  refundedAt      DateTime?

  order           Order           @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@index([gateway, status])
  @@index([status, createdAt])
}
```

### 6. Wallet

```prisma
model Wallet {
  id            String    @id @default(cuid())
  userId        String    @unique
  balance       Decimal   @default(0) @db.Decimal(18, 4)   // Fcoin balance
  lockedBalance Decimal   @default(0) @db.Decimal(18, 4)   // กำลังถูกใช้ใน pending order

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  transactions  WalletTransaction[]

  @@index([userId])
}
```

### 7. WalletTransaction

```prisma
model WalletTransaction {
  id              String              @id @default(cuid())
  walletId        String
  userId          String                                  // denormalized — index/filter เร็ว
  orderId         String?                                 // อ้างอิง order (ถ้าเกี่ยวข้อง)

  type            WalletTxType
  direction       WalletTxDirection
  amount          Decimal             @db.Decimal(18, 4)   // amount เป็นบวกเสมอ; ใช้ direction ตัดสิน
  balanceAfter    Decimal             @db.Decimal(18, 4)   // snapshot หลัง tx นี้

  noteKey         String?                                 // i18n key
  metadata        Json?

  createdById     String?                                 // ใครเป็นคนทำ (admin? self?)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  wallet          Wallet              @relation(fields: [walletId], references: [id], onDelete: Restrict)
  user            User                @relation(fields: [userId], references: [id], onDelete: Restrict)
  order           Order?              @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([walletId, createdAt])
  @@index([userId, createdAt])
  @@index([orderId])
  @@index([type, createdAt])
}
```

### 8. Promocode

```prisma
model Promocode {
  id              String         @id @default(cuid())
  code            String         @unique                  // case-insensitive — store uppercase
  type            PromocodeType
  value           Decimal        @db.Decimal(12, 2)       // % หรือ THB หรือ Fcoin (interpret ตาม type)
  maxRedemptions  Int?                                    // null = unlimited
  redemptionCount Int            @default(0)
  perUserLimit    Int            @default(1)
  minOrderAmount  Decimal?       @db.Decimal(12, 2)
  applicablePackageCodes Json?                            // string[] ของ Package.code (null = ทุก package)
  startsAt        DateTime?
  expiresAt       DateTime?
  isActive        Boolean        @default(true)

  // Audit
  createdById     String?
  updatedById     String?

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  orders          Order[]

  @@index([isActive, expiresAt])
  @@index([code])
}
```

### 9. MembershipTier

```prisma
model MembershipTier {
  id                String              @id @default(cuid())
  code              MembershipTierCode  @unique
  nameKey           String                                // 'membership.bronze.name'
  minPoints         Int                 @default(0)
  discountPercent   Decimal             @default(0) @db.Decimal(5, 2)
  fcoinBonusPercent Decimal             @default(0) @db.Decimal(5, 2)
  perks             Json?                                 // structured perks (i18n keys)
  iconUrl           String?
  sortOrder         Int                 @default(0)

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  users             User[]

  @@index([sortOrder])
}
```

### 10. Reward

```prisma
model Reward {
  id              String       @id @default(cuid())
  nameKey         String
  descriptionKey  String?
  type            RewardType
  pointsCost      Int                                  // คะแนนที่ใช้แลก
  payload         Json                                 // type=fcoin: {amount}; type=free_days: {days}; ...
  stock           Int?                                 // null = unlimited
  redeemedCount   Int          @default(0)
  imageUrl        String?
  isActive        Boolean      @default(true)
  startsAt        DateTime?
  expiresAt       DateTime?

  // Audit
  createdById     String?
  updatedById     String?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  redemptions     RewardRedemption[]

  @@index([isActive, expiresAt])
  @@index([type, isActive])
}
```

### 11. RewardRedemption

```prisma
model RewardRedemption {
  id              String                    @id @default(cuid())
  userId          String
  rewardId        String
  pointsSpent     Int
  status          RewardRedemptionStatus    @default(pending)
  fulfillmentRef  String?                                  // เช่น promocode id, walletTx id, address id
  notesKey        String?
  metadata        Json?

  createdAt       DateTime                  @default(now())
  updatedAt       DateTime                  @updatedAt
  fulfilledAt     DateTime?

  user            User                      @relation(fields: [userId], references: [id], onDelete: Restrict)
  reward          Reward                    @relation(fields: [rewardId], references: [id], onDelete: Restrict)

  @@index([userId, createdAt])
  @@index([rewardId])
  @@index([status])
}
```

### 12. SupportTicket

```prisma
model SupportTicket {
  id              String           @id @default(cuid())
  ticketNumber    String           @unique             // 'SUP-202605-000045'
  userId          String
  assignedToId    String?                              // staff user id

  subjectKey      String?                              // i18n key (ถ้ามาจาก template)
  subject         String                               // free text จาก user
  channel         TicketChannel    @default(bot)
  status          TicketStatus     @default(open)
  priority        TicketPriority   @default(normal)

  // FAQ matching
  faqMatchScore   Float?                               // ถ้า bot จับ intent ได้
  escalatedAt     DateTime?
  closedAt        DateTime?
  resolvedAt      DateTime?

  metadata        Json?

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  deletedAt       DateTime?

  user            User             @relation("TicketOwner", fields: [userId], references: [id], onDelete: Restrict)
  assignedTo      User?            @relation("TicketAssignee", fields: [assignedToId], references: [id], onDelete: SetNull)
  messages        SupportMessage[]

  @@index([userId, status])
  @@index([assignedToId, status])
  @@index([status, channel])
  @@index([createdAt])
}
```

### 13. SupportMessage

```prisma
model SupportMessage {
  id              String              @id @default(cuid())
  ticketId        String
  senderType      SupportSenderType
  senderId        String?                              // null ถ้า bot/system
  contentKey      String?                              // i18n key (bot replies)
  content         String                               // free text — Markdown ก็ได้
  imageUrls       Json?                                // string[]
  metadata        Json?                                // bot intent, confidence, attachments

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  ticket          SupportTicket       @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  sender          User?               @relation(fields: [senderId], references: [id], onDelete: SetNull)

  @@index([ticketId, createdAt])
  @@index([senderId])
}
```

> **Note**: `SupportMessage` ใช้ `onDelete: Cascade` กับ ticket เพราะถ้า ticket ถูก hard-delete (admin tool) ข้อความติดไปด้วย — แต่ ticket มี `deletedAt` (soft delete) เป็น default

### 14. Feedback

```prisma
model Feedback {
  id              String      @id @default(cuid())
  userId          String?                              // optional — รับจาก guest ได้
  emulatorId      String?
  ticketId        String?
  rating          Int                                  // 1–5
  contentKey      String?
  content         String?
  metadata        Json?

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  user            User?       @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([rating])
  @@index([emulatorId])
  @@index([ticketId])
}
```

---

## Relation Summary (onDelete matrix)

| From | To | onDelete | เหตุผล |
|---|---|---|---|
| User → MembershipTier | tier | SetNull | ลบ tier แล้ว user ยังอยู่ (ตกชั้น) |
| Wallet → User | user | Restrict | ห้ามลบ user ที่มียอดเงิน |
| WalletTransaction → Wallet | wallet | Restrict | preserve audit |
| WalletTransaction → User | user | Restrict | preserve audit |
| WalletTransaction → Order | order | SetNull | order หาย แต่ tx เก็บเป็น history |
| Emulator → User | user | Restrict | ห้ามลบ user ที่ยังมี emulator active |
| Emulator → Package | package | Restrict | preserve historical reference |
| Emulator → Order (1:1 source) | order | SetNull | order หาย ตัด link |
| Order → User | user | Restrict | preserve financial history |
| Order → Package | package | Restrict | preserve snapshot |
| Order → Emulator (renewal) | emulator | SetNull | emulator ถูกลบ → order ยังเก็บ |
| Order → Promocode | promocode | SetNull | promocode ลบได้ |
| Payment → Order | order | Restrict | ห้ามทิ้ง payment ลอย |
| RewardRedemption → User | user | Restrict | preserve history |
| RewardRedemption → Reward | reward | Restrict | preserve history |
| SupportTicket → User (owner) | user | Restrict | tickets ผูกกับ user |
| SupportTicket → User (assignee) | user | SetNull | staff ลาออก ticket re-assign ได้ |
| SupportMessage → Ticket | ticket | Cascade | hard-delete ticket → ลบข้อความ |
| SupportMessage → User (sender) | user | SetNull | sender ลบได้ ข้อความเก็บไว้ |
| Feedback → User | user | SetNull | guest feedback ok |

---

## Index Strategy

- **High-cardinality WHERE filters**: `userId`, `status` ทุก resource ที่ list ต่อ user
- **Time-series queries**: composite `(status, createdAt)` หรือ `(userId, createdAt)` สำหรับ dashboard / pagination
- **Webhook idempotency**: `Payment.gatewayChargeId @unique`, `Payment.webhookEventId @unique`
- **Lookup keys**: `User.email`, `User.phone`, `Promocode.code`, `Order.orderNumber`, `SupportTicket.ticketNumber`, `Package.code` ทั้งหมด `@unique`
- **Cron scans**: `Emulator @@index([status, expiresAt])` สำหรับ expiry sweeper

---

## Seed Data (Phase 0)

ตารางที่ต้อง seed ใน Phase 0:

1. **MembershipTier**: bronze (0pt), silver (1000pt), gold (5000pt), platinum (20000pt)
2. **Package**: SFAST, MFAST (ตาม CLAUDE.md)
3. **Admin user**: 1 บัญชี (จาก env `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`)

Seed script: `packages/db/prisma/seed.ts` (backend agent)

---

## Migration / Rollback Plan

- **Initial migration**: `pnpm --filter @emulfast/db prisma migrate dev --name init`
- **Rollback strategy** (Phase 0): drop database + re-migrate (Demo ยังไม่มี data จริง)
- **Production rule** (Phase 7+): ห้าม `prisma migrate reset` — ใช้ `migrate deploy` + manual SQL revert script

---

## Open Questions (สำหรับ Lead/DevOps)

1. ขนาด avatar/feedback image — เก็บใน DB (URL) ตามนี้ หรือต้องมี `Asset` table ใน Phase 6 (chat upload)? — **proposed**: รอ Phase 6 ค่อยเพิ่ม `SupportAsset` model
2. `Emulator.hostNode` ตอนนี้ default `"default"` — ต้องเป็น FK ไปยัง `HostNode` table หรือยัง? — **proposed**: ยังไม่ต้อง (Demo single-host); Phase 7+ ค่อยเพิ่ม
3. ต้องการ `AuditLog` global table หรือไม่ (ทุก admin action)? — **proposed**: เพิ่มใน Phase 4 (Admin Backend)
