# =============================================================================
# PULSE — Verify Database Entries
# =============================================================================
# Usage: node tests\verify-db.mjs
# Requires: @prisma/client, DATABASE_URL env var
# =============================================================================
# Checks that the User table exists and has the expected schema.
# =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(60));
  console.log("PULSE — Database Verification");
  console.log("=".repeat(60));
  console.log("");

  try {
    // 1. Check connection
    await prisma.$connect();
    console.log("[OK] Database connection successful");

    // 2. Check User table exists
    const userCount = await prisma.user.count();
    console.log(`[OK] User table exists (${userCount} users)`);

    // 3. Check Project table exists
    const projectCount = await prisma.project.count();
    console.log(`[OK] Project table exists (${projectCount} projects)`);

    // 4. Check Framework table exists
    const frameworkCount = await prisma.framework.count();
    console.log(`[OK] Framework table exists (${frameworkCount} frameworks)`);

    // 5. Check User schema fields
    const userFields = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;
    console.log("");
    console.log("User table schema:");
    console.log("-".repeat(50));
    for (const field of userFields) {
      const nullable = field.is_nullable === "YES" ? "NULL" : "NOT NULL";
      console.log(`  ${field.column_name.padEnd(30)} ${field.data_type.padEnd(20)} ${nullable}`);
    }

    // 6. Check indexes on User table
    const userIndexes = await prisma.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'users'
    `;
    console.log("");
    console.log("User table indexes:");
    console.log("-".repeat(50));
    for (const idx of userIndexes) {
      console.log(`  ${idx.indexname}`);
    }

    // 7. Check if any users exist
    if (userCount > 0) {
      console.log("");
      console.log("Existing users:");
      console.log("-".repeat(50));
      const users = await prisma.user.findMany({
        select: {
          id: true,
          githubLogin: true,
          email: true,
          name: true,
          createdAt: true,
        },
        take: 5,
      });
      for (const user of users) {
        console.log(`  ${user.githubLogin} (${user.email || "no email"}) - ${user.id}`);
      }
    } else {
      console.log("");
      console.log("[INFO] No users yet. Complete the OAuth flow to create one.");
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("VERIFICATION COMPLETE");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("[ERROR]", error.message);
    console.error("");
    console.error("Possible causes:");
    console.error("  1. PostgreSQL is not running");
    console.error("  2. DATABASE_URL is not set or incorrect");
    console.error("  3. Database 'ryme' does not exist");
    console.error("  4. Schema has not been pushed (run: pnpm exec prisma db push)");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
