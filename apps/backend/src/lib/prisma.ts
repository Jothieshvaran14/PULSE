import { prisma } from "@pulse/db";

/**
 * Re-export the PrismaClient singleton from the db package.
 * Centralizes all database access through a single import.
 */
export { prisma };
