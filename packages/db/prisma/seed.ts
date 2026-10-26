import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FRAMEWORKS = [
  {
    name: "nextjs",
    displayName: "Next.js",
    detectFiles: ["next.config.js", "next.config.mjs", "next.config.ts"],
    defaultPort: 3000,
    category: "fullstack",
  },
  {
    name: "react",
    displayName: "React",
    detectFiles: [],
    defaultPort: 80,
    category: "frontend",
  },
  {
    name: "express",
    displayName: "Express",
    detectFiles: [],
    defaultPort: 3000,
    category: "backend",
  },
  {
    name: "node",
    displayName: "Node.js",
    detectFiles: ["package.json"],
    defaultPort: 3000,
    category: "backend",
  },
  {
    name: "fastapi",
    displayName: "FastAPI",
    detectFiles: ["requirements.txt", "pyproject.toml"],
    defaultPort: 8000,
    category: "backend",
  },
  {
    name: "flask",
    displayName: "Flask",
    detectFiles: ["requirements.txt", "pyproject.toml"],
    defaultPort: 5000,
    category: "backend",
  },
  {
    name: "django",
    displayName: "Django",
    detectFiles: ["manage.py", "requirements.txt", "pyproject.toml"],
    defaultPort: 8000,
    category: "backend",
  },
  {
    name: "springboot",
    displayName: "Spring Boot",
    detectFiles: ["pom.xml", "build.gradle", "build.gradle.kts"],
    defaultPort: 8080,
    category: "backend",
  },
  {
    name: "go",
    displayName: "Go",
    detectFiles: ["go.mod"],
    defaultPort: 8080,
    category: "backend",
  },
  {
    name: "rust",
    displayName: "Rust",
    detectFiles: ["Cargo.toml"],
    defaultPort: 8080,
    category: "backend",
  },
  {
    name: "static",
    displayName: "Static HTML",
    detectFiles: ["index.html"],
    defaultPort: 80,
    category: "static",
  },
];

async function main() {
  console.log("🌱 Seeding frameworks...");

  for (const fw of FRAMEWORKS) {
    await prisma.framework.upsert({
      where: { name: fw.name },
      update: {
        displayName: fw.displayName,
        detectFiles: fw.detectFiles,
        defaultPort: fw.defaultPort,
        category: fw.category,
      },
      create: {
        name: fw.name,
        displayName: fw.displayName,
        detectFiles: fw.detectFiles,
        defaultPort: fw.defaultPort,
        category: fw.category,
      },
    });
    console.log(`  ✓ ${fw.displayName}`);
  }

  console.log(`\n✅ Seeded ${FRAMEWORKS.length} frameworks.`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
