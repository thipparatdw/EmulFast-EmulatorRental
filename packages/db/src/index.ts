import { PrismaClient } from "@prisma/client";

// Singleton PrismaClient — ใช้ global object เพื่อป้องกัน hot-reload สร้าง connection ซ้ำ
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// Re-export ทุก type จาก @prisma/client
export * from "@prisma/client";
