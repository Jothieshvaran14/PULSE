import { PrismaClient } from "@prisma/client";

/**
 * Singleton PrismaClient instance.
 *
 * In development, we store the client on the global object to prevent
 * creating multiple connections during hot-reloading. In production,
 * a single instance is created per process.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export * from "@prisma/client";
