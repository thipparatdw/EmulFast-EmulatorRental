import { PrismaClient, MembershipTierCode } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 65536,
};

async function main(): Promise<void> {
  console.log("Seeding database...");

  // ─── MembershipTier ─────────────────────────────────────────────────────────
  const tiers: {
    code: MembershipTierCode;
    nameKey: string;
    minPoints: number;
    discountPercent: string;
    fcoinBonusPercent: string;
    perks: object;
    sortOrder: number;
  }[] = [
    {
      code: "bronze",
      nameKey: "membership.bronze.name",
      minPoints: 0,
      discountPercent: "0.00",
      fcoinBonusPercent: "0.00",
      perks: {
        features: ["membership.bronze.perk.basic_support"],
      },
      sortOrder: 1,
    },
    {
      code: "silver",
      nameKey: "membership.silver.name",
      minPoints: 1000,
      discountPercent: "2.00",
      fcoinBonusPercent: "5.00",
      perks: {
        features: [
          "membership.silver.perk.discount_2pct",
          "membership.silver.perk.fcoin_bonus_5pct",
          "membership.silver.perk.priority_support",
        ],
      },
      sortOrder: 2,
    },
    {
      code: "gold",
      nameKey: "membership.gold.name",
      minPoints: 5000,
      discountPercent: "5.00",
      fcoinBonusPercent: "10.00",
      perks: {
        features: [
          "membership.gold.perk.discount_5pct",
          "membership.gold.perk.fcoin_bonus_10pct",
          "membership.gold.perk.priority_support",
          "membership.gold.perk.early_access",
        ],
      },
      sortOrder: 3,
    },
    {
      code: "platinum",
      nameKey: "membership.platinum.name",
      minPoints: 20000,
      discountPercent: "10.00",
      fcoinBonusPercent: "20.00",
      perks: {
        features: [
          "membership.platinum.perk.discount_10pct",
          "membership.platinum.perk.fcoin_bonus_20pct",
          "membership.platinum.perk.dedicated_support",
          "membership.platinum.perk.early_access",
          "membership.platinum.perk.custom_branding",
        ],
      },
      sortOrder: 4,
    },
  ];

  for (const tier of tiers) {
    await prisma.membershipTier.upsert({
      where: { code: tier.code },
      update: {
        nameKey: tier.nameKey,
        minPoints: tier.minPoints,
        discountPercent: tier.discountPercent,
        fcoinBonusPercent: tier.fcoinBonusPercent,
        perks: tier.perks,
        sortOrder: tier.sortOrder,
      },
      create: tier,
    });
  }
  console.log("MembershipTier seeded (4 tiers)");

  // ─── Package ─────────────────────────────────────────────────────────────────
  // billingDayOptions [1,3,7,30] เก็บใน metadata field ของ Order/ไม่มีใน Package schema
  // Package schema: pricePerDay, pricePerMonth, fcoinPerDay, ramMb, romGb
  // SFAST: Android 10, 3 cores, 3 GB RAM (3072 MB), 30 GB ROM, ราคา 10 THB/day
  // MFAST: Android 10/12, 3 cores, 4 GB RAM (4096 MB), 64 GB ROM, ราคา 15 THB/day

  const packages = [
    {
      code: "SFAST",
      nameKey: "packages.sfast.name",
      descriptionKey: "packages.sfast.description",
      androidVersion: "10",
      cpuCores: 3,
      ramMb: 3072,  // 3 GB
      romGb: 30,
      pricePerDay: "10.00",
      pricePerMonth: "300.00",   // 10 * 30
      fcoinPerDay: "1000.0000",  // 1 THB = 100 Fcoin
      isActive: true,
      sortOrder: 1,
    },
    {
      code: "MFAST",
      nameKey: "packages.mfast.name",
      descriptionKey: "packages.mfast.description",
      androidVersion: "10",
      cpuCores: 3,
      ramMb: 4096,  // 4 GB
      romGb: 64,
      pricePerDay: "15.00",
      pricePerMonth: "450.00",   // 15 * 30
      fcoinPerDay: "1500.0000",
      isActive: true,
      sortOrder: 2,
    },
  ];

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { code: pkg.code },
      update: {
        nameKey: pkg.nameKey,
        descriptionKey: pkg.descriptionKey,
        androidVersion: pkg.androidVersion,
        cpuCores: pkg.cpuCores,
        ramMb: pkg.ramMb,
        romGb: pkg.romGb,
        pricePerDay: pkg.pricePerDay,
        pricePerMonth: pkg.pricePerMonth,
        fcoinPerDay: pkg.fcoinPerDay,
        isActive: pkg.isActive,
        sortOrder: pkg.sortOrder,
      },
      create: pkg,
    });
  }
  console.log("Package seeded (SFAST, MFAST)");

  // ─── Admin User ──────────────────────────────────────────────────────────────
  // ใช้ env var ถ้ามี, fallback เป็น default สำหรับ dev/demo
  const adminEmail =
    process.env["SEED_ADMIN_EMAIL"] ?? "admin@emulfast.local";
  const adminPassword =
    process.env["SEED_ADMIN_PASSWORD"] ?? "Admin@1234";
  const adminDisplayName =
    process.env["SEED_ADMIN_DISPLAY_NAME"] ?? "EmulFast Admin";

  console.log(`Hashing admin password with argon2id...`);
  const passwordHash = await argon2.hash(adminPassword, ARGON2_OPTIONS);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      displayName: adminDisplayName,
      role: "admin",
      status: "active",
    },
    create: {
      email: adminEmail,
      passwordHash,
      displayName: adminDisplayName,
      role: "admin",
      status: "active",
      locale: "th",
      emailVerifiedAt: new Date(),
    },
  });

  // สร้าง wallet สำหรับ admin ถ้ายังไม่มี
  const existingWallet = await prisma.wallet.findUnique({
    where: { userId: adminUser.id },
  });
  if (!existingWallet) {
    await prisma.wallet.create({
      data: {
        userId: adminUser.id,
        balance: "0",
        lockedBalance: "0",
      },
    });
  }

  console.log(`Admin user seeded: ${adminEmail}`);

  // ─── Dev Test User + Order (Phase 1 smoke test) ─────────────────────────────
  const devEmail = process.env["SEED_DEV_EMAIL"] ?? "dev@emulfast.local";
  const devPassword = process.env["SEED_DEV_PASSWORD"] ?? "Dev@1234";
  const devPasswordHash = await argon2.hash(devPassword, ARGON2_OPTIONS);

  const devUser = await prisma.user.upsert({
    where: { email: devEmail },
    update: { passwordHash: devPasswordHash },
    create: {
      email: devEmail,
      passwordHash: devPasswordHash,
      displayName: "Dev Test User",
      role: "user",
      status: "active",
      locale: "th",
      emailVerifiedAt: new Date(),
    },
  });

  // สร้าง wallet ถ้ายังไม่มี
  const existingDevWallet = await prisma.wallet.findUnique({
    where: { userId: devUser.id },
  });
  if (!existingDevWallet) {
    await prisma.wallet.create({
      data: { userId: devUser.id, balance: "0", lockedBalance: "0" },
    });
  }

  // สร้าง test order สำหรับ Phase 1 smoke test
  const sfastPackage = await prisma.package.findUnique({
    where: { code: "SFAST" },
  });
  if (sfastPackage) {
    const existingOrder = await prisma.order.findFirst({
      where: {
        userId: devUser.id,
        type: "emulator_purchase",
        status: "paid",
      },
    });
    if (!existingOrder) {
      await prisma.order.create({
        data: {
          orderNumber: "TEST-PHASE1-001",
          userId: devUser.id,
          type: "emulator_purchase",
          packageId: sfastPackage.id,
          currency: "THB",
          subtotal: "300.00",
          discount: "0.00",
          total: "300.00",
          paymentMethod: "fcoin",
          status: "paid",
          billingDays: 30,
          paidAt: new Date(),
        },
      });
      console.log("Phase 1 test order created: TEST-PHASE1-001");
    }
  }

  console.log(`Dev user seeded: ${devEmail}`);
  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
