export interface FrameworkDefinition {
  /** Unique framework identifier */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Category: frontend, backend, fullstack, static */
  category: "frontend" | "backend" | "fullstack" | "static";
  /** Files that indicate this framework (checked in order) */
  detectFiles: string[];
  /** Dependencies to look for in package.json or requirements.txt */
  detectDependencies: string[];
  /** Default port the framework serves on */
  defaultPort: number;
  /** Dockerfile template filename (without path) */
  templateFile: string;
}

/**
 * Framework definitions ordered by detection priority (most specific first).
 * This ordering prevents misclassification — e.g., Next.js must be checked
 * before generic React, since a Next.js project also has react in its deps.
 */
export const FRAMEWORK_DEFINITIONS: readonly FrameworkDefinition[] = [
  {
    name: "nextjs",
    displayName: "Next.js",
    category: "fullstack",
    detectFiles: ["next.config.js", "next.config.mjs", "next.config.ts"],
    detectDependencies: ["next"],
    defaultPort: 3000,
    templateFile: "nextjs.Dockerfile",
  },
  {
    name: "react",
    displayName: "React",
    category: "frontend",
    detectFiles: [],
    detectDependencies: ["react", "react-dom"],
    defaultPort: 80,
    templateFile: "react.Dockerfile",
  },
  {
    name: "express",
    displayName: "Express",
    category: "backend",
    detectFiles: [],
    detectDependencies: ["express"],
    defaultPort: 3000,
    templateFile: "express.Dockerfile",
  },
  {
    name: "node",
    displayName: "Node.js",
    category: "backend",
    detectFiles: ["package.json"],
    detectDependencies: [],
    defaultPort: 3000,
    templateFile: "node.Dockerfile",
  },
  {
    name: "fastapi",
    displayName: "FastAPI",
    category: "backend",
    detectFiles: ["requirements.txt", "pyproject.toml"],
    detectDependencies: ["fastapi"],
    defaultPort: 8000,
    templateFile: "fastapi.Dockerfile",
  },
  {
    name: "flask",
    displayName: "Flask",
    category: "backend",
    detectFiles: ["requirements.txt", "pyproject.toml"],
    detectDependencies: ["flask", "Flask"],
    defaultPort: 5000,
    templateFile: "flask.Dockerfile",
  },
  {
    name: "django",
    displayName: "Django",
    category: "backend",
    detectFiles: ["manage.py", "requirements.txt", "pyproject.toml"],
    detectDependencies: ["django", "Django"],
    defaultPort: 8000,
    templateFile: "django.Dockerfile",
  },
  {
    name: "springboot",
    displayName: "Spring Boot",
    category: "backend",
    detectFiles: ["pom.xml", "build.gradle", "build.gradle.kts"],
    detectDependencies: [],
    defaultPort: 8080,
    templateFile: "springboot.Dockerfile",
  },
  {
    name: "go",
    displayName: "Go",
    category: "backend",
    detectFiles: ["go.mod"],
    detectDependencies: [],
    defaultPort: 8080,
    templateFile: "go.Dockerfile",
  },
  {
    name: "rust",
    displayName: "Rust",
    category: "backend",
    detectFiles: ["Cargo.toml"],
    detectDependencies: [],
    defaultPort: 8080,
    templateFile: "rust.Dockerfile",
  },
  {
    name: "static",
    displayName: "Static HTML",
    category: "static",
    detectFiles: ["index.html"],
    detectDependencies: [],
    defaultPort: 80,
    templateFile: "static.Dockerfile",
  },
] as const;

/** Lookup map for quick framework access by name */
export const FRAMEWORK_MAP = new Map<string, FrameworkDefinition>(
  FRAMEWORK_DEFINITIONS.map((fw) => [fw.name, fw])
);
