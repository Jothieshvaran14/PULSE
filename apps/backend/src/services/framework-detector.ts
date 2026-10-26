import fs from "node:fs/promises";
import path from "node:path";
import type { DetectionResult } from "@ryme/shared";
import { FrameworkDetectionError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string; npm?: string };
  packageManager?: string;
}

interface NodeDeps {
  all: Set<string>;
  direct: Set<string>;
  dev: Set<string>;
}

/**
 * FrameworkDetector analyzes a project directory to identify the framework,
 * package manager, build/start commands, and output directory.
 *
 * Detection strategy:
 * 1. Check for Dockerfile → custom framework
 * 2. Check for Node.js projects (package.json) → parse dependencies + configs
 *    - Priority: Nuxt > Next.js > Astro > Vue > React (Vite/CRA) > Express > NestJS > Node.js
 * 3. Check for Python projects → parse requirements + pyproject.toml
 *    - Priority: FastAPI > Django > Flask > generic Python
 * 4. Check for Java projects → pom.xml / build.gradle
 *    - Priority: Spring Boot > Maven > Gradle
 * 5. Check for Go → go.mod
 * 6. Check for Rust → Cargo.toml
 * 7. Check for PHP → composer.json
 * 8. Check for static HTML → index.html
 *
 * Frameworks are checked in priority order to prevent misclassification.
 */
export class FrameworkDetector {
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async readFileSafe(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    const content = await this.readFileSafe(filePath);
    if (!content) return null;
    try {
      return JSON.parse(content) as T;
    } catch {
      logger.warn({ path: filePath }, "Failed to parse JSON");
      return null;
    }
  }

  private async glob(projectPath: string, pattern: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      const regex = new RegExp(
        "^" +
          pattern
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".") +
          "$"
      );
      return entries
        .filter((e) => regex.test(e.name))
        .map((e) => e.name);
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Package manager detection
  // -------------------------------------------------------------------------

  private async detectPackageManager(
    projectPath: string,
    pkg: PackageJson | null
  ): Promise<string | null> {
    // 1. Explicit packageManager field in package.json
    if (pkg?.packageManager) {
      const pm = pkg.packageManager.split("@")[0];
      if (pm) {
        logger.info({ packageManager: pm }, "Detected packageManager field in package.json");
        return pm;
      }
    }

    // 2. Lock file detection
    const lockFiles: [string, string][] = [
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["bun.lockb", "bun"],
      ["bun.lock", "bun"],
      ["package-lock.json", "npm"],
    ];

    for (const [file, name] of lockFiles) {
      if (await this.fileExists(path.join(projectPath, file))) {
        logger.info({ packageManager: name, lockFile: file }, "Detected lock file");
        return name;
      }
    }

    // 3. Fall back to npm
    logger.info("No lock file found — defaulting to npm");
    return "npm";
  }

  // -------------------------------------------------------------------------
  // Node.js dependency parsing
  // -------------------------------------------------------------------------

  private async parseNodeDeps(
    projectPath: string
  ): Promise<{ pkg: PackageJson | null; deps: NodeDeps }> {
    const pkg = await this.readJson<PackageJson>(
      path.join(projectPath, "package.json")
    );
    if (!pkg) {
      return {
        pkg: null,
        deps: { all: new Set(), direct: new Set(), dev: new Set() },
      };
    }

    const direct = new Set(Object.keys(pkg.dependencies ?? {}));
    const dev = new Set(Object.keys(pkg.devDependencies ?? {}));
    const all = new Set([...direct, ...dev]);

    return { pkg, deps: { all, direct, dev } };
  }

  // -------------------------------------------------------------------------
  // Config file detection for Node.js frameworks
  // -------------------------------------------------------------------------

  private async detectNodeConfig(projectPath: string): Promise<{
    hasVite: boolean;
    hasCra: boolean;
    hasNext: boolean;
    hasNuxt: boolean;
    hasAstro: boolean;
    hasSvelte: boolean;
    hasVue: boolean;
    viteFramework: string | null;
  }> {
    const result = {
      hasVite: false,
      hasCra: false,
      hasNext: false,
      hasNuxt: false,
      hasAstro: false,
      hasSvelte: false,
      hasVue: false,
      viteFramework: null as string | null,
    };

    // Vite config files
    const viteConfigs = await this.glob(projectPath, "vite.config.*");
    result.hasVite = viteConfigs.length > 0;

    if (result.hasVite) {
      // Read vite config to detect framework plugin
      const viteConfigContent = await this.readFileSafe(
        path.join(projectPath, viteConfigs[0]!)
      );
      if (viteConfigContent) {
        const lower = viteConfigContent.toLowerCase();
        if (lower.includes("@vitejs/plugin-react")) {
          result.viteFramework = "react-vite";
          logger.info("Vite config has @vitejs/plugin-react");
        } else if (lower.includes("@vitejs/plugin-vue")) {
          result.viteFramework = "vue-vite";
          result.hasVue = true;
          logger.info("Vite config has @vitejs/plugin-vue");
        } else if (lower.includes("svelte")) {
          result.viteFramework = "svelte";
          result.hasSvelte = true;
          logger.info("Vite config has svelte plugin");
        }
      }
    }

    // CRA detection
    const reactScriptsDep =
      (await this.readJson<PackageJson>(
        path.join(projectPath, "package.json")
      ))?.dependencies?.["react-scripts"] ||
      (await this.readJson<PackageJson>(
        path.join(projectPath, "package.json")
      ))?.devDependencies?.["react-scripts"];
    result.hasCra = !!reactScriptsDep;

    // Next.js config files
    const nextConfigs = await this.glob(projectPath, "next.config.*");
    result.hasNext = nextConfigs.length > 0;
    if (result.hasNext) {
      logger.info({ config: nextConfigs[0] }, "Found Next.js config");
    }

    // Nuxt config files
    const nuxtConfigs = await this.glob(projectPath, "nuxt.config.*");
    result.hasNuxt = nuxtConfigs.length > 0;
    if (result.hasNuxt) {
      logger.info({ config: nuxtConfigs[0] }, "Found Nuxt config");
    }

    // Astro config files
    const astroConfigs = await this.glob(projectPath, "astro.config.*");
    result.hasAstro = astroConfigs.length > 0;
    if (result.hasAstro) {
      logger.info({ config: astroConfigs[0] }, "Found Astro config");
    }

    // SvelteKit detection (svelte.config.*)
    const svelteConfigs = await this.glob(projectPath, "svelte.config.*");
    if (svelteConfigs.length > 0) {
      result.hasSvelte = true;
      logger.info({ config: svelteConfigs[0] }, "Found Svelte config");
    }

    // Vue detection (vue.config.* or .vue files)
    const vueConfigs = await this.glob(projectPath, "vue.config.*");
    if (vueConfigs.length > 0) {
      result.hasVue = true;
      logger.info({ config: vueConfigs[0] }, "Found Vue config");
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Command detection from scripts in package.json
  // -------------------------------------------------------------------------

  private detectNodeCommands(
    pkg: PackageJson | null
  ): {
    buildCommand: string | null;
    startCommand: string | null;
    installCommand: string | null;
    devCommand: string | null;
    outputDirectory: string | null;
  } {
    const scripts = pkg?.scripts ?? {};
    const buildCommand = scripts.build ?? null;
    const devCommand = scripts.dev ?? scripts.start ?? null;
    const startCommand = scripts.start ?? null;
    const installCommand = "npm install";

    // Output directory detection from build script
    let outputDirectory: string | null = null;
    if (buildCommand) {
      // Common patterns
      if (buildCommand.includes("next build")) {
        outputDirectory = ".next";
      } else if (
        buildCommand.includes("vite build") ||
        buildCommand.includes("vue-cli-service build")
      ) {
        outputDirectory = "dist";
      } else if (buildCommand.includes("react-scripts build")) {
        outputDirectory = "build";
      } else if (buildCommand.includes("nuxt build") || buildCommand.includes("nuxi build")) {
        outputDirectory = ".output";
      } else if (buildCommand.includes("astro build")) {
        outputDirectory = "dist";
      } else if (buildCommand.includes("svelte-kit build") || buildCommand.includes("vite build")) {
        outputDirectory = "build";
      } else if (buildCommand.includes("tsc") || buildCommand.includes("tsup") || buildCommand.includes("rollup")) {
        outputDirectory = "dist";
      } else if (buildCommand.includes("esbuild")) {
        outputDirectory = "dist";
      }
    }

    return { buildCommand, startCommand, installCommand, devCommand, outputDirectory };
  }

  // -------------------------------------------------------------------------
  // Python detection
  // -------------------------------------------------------------------------

  private async detectPython(projectPath: string): Promise<DetectionResult | null> {
    const hasRequirements = await this.fileExists(
      path.join(projectPath, "requirements.txt")
    );
    const hasPyproject = await this.fileExists(
      path.join(projectPath, "pyproject.toml")
    );

    if (!hasRequirements && !hasPyproject) return null;

    // Parse requirements.txt
    const deps = new Set<string>();
    if (hasRequirements) {
      const reqContent = await this.readFileSafe(
        path.join(projectPath, "requirements.txt")
      );
      if (reqContent) {
        for (const line of reqContent.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("-")) {
            const pkgName = trimmed.split(/[=<>~![\]]/)[0]?.trim();
            if (pkgName) {
              deps.add(pkgName.toLowerCase());
            }
          }
        }
      }
    }

    // Parse pyproject.toml
    if (hasPyproject) {
      const pyprojectContent = await this.readFileSafe(
        path.join(projectPath, "pyproject.toml")
      );
      if (pyprojectContent) {
        const lower = pyprojectContent.toLowerCase();
        if (lower.includes("fastapi")) deps.add("fastapi");
        if (lower.includes("flask")) deps.add("flask");
        if (lower.includes("django")) deps.add("django");

        // Try to extract version
        const versionMatch = pyprojectContent.match(
          /(?:fastapi|flask|django)\s*[=>~]+\s*["']?([0-9]+\.[0-9]+[0-9.]*)/
        );
        if (versionMatch && versionMatch[1]) {
          // Version will be set below
        }
      }
    }

    // Check for manage.py (Django)
    const hasManagePy = await this.fileExists(path.join(projectPath, "manage.py"));

    // FastAPI
    if (deps.has("fastapi")) {
      const version = deps.has("fastapi") ? this.extractVersion(deps, "fastapi") : null;
      return {
        framework: "fastapi",
        displayName: "FastAPI",
        confidence: 0.95,
        detectedBy: hasRequirements
          ? "requirements.txt → fastapi dependency"
          : "pyproject.toml → fastapi dependency",
        defaultPort: 8000,
        hasDockerfile: false,
        packageManager: "pip",
        buildCommand: null,
        startCommand: "uvicorn main:app --host 0.0.0.0 --port 8000",
        installCommand: hasRequirements ? "pip install -r requirements.txt" : "pip install -e .",
        devCommand: "uvicorn main:app --reload --host 0.0.0.0 --port 8000",
        outputDirectory: null,
        frameworkVersion: version,
      };
    }

    // Django
    if (deps.has("django") || hasManagePy) {
      return {
        framework: "django",
        displayName: "Django",
        confidence: deps.has("django") ? 0.95 : 0.85,
        detectedBy: deps.has("django")
          ? "requirements.txt → django dependency"
          : "manage.py found",
        defaultPort: 8000,
        hasDockerfile: false,
        packageManager: "pip",
        buildCommand: "python manage.py collectstatic --noinput",
        startCommand: "python manage.py runserver 0.0.0.0:8000",
        installCommand: hasRequirements ? "pip install -r requirements.txt" : "pip install -e .",
        devCommand: "python manage.py runserver 0.0.0.0:8000",
        outputDirectory: "staticfiles",
        frameworkVersion: null,
      };
    }

    // Flask
    if (deps.has("flask")) {
      return {
        framework: "flask",
        displayName: "Flask",
        confidence: 0.9,
        detectedBy: "requirements.txt → flask dependency",
        defaultPort: 5000,
        hasDockerfile: false,
        packageManager: "pip",
        buildCommand: null,
        startCommand: "flask run --host 0.0.0.0 --port 5000",
        installCommand: hasRequirements ? "pip install -r requirements.txt" : "pip install -e .",
        devCommand: "flask run --debug --host 0.0.0.0 --port 5000",
        outputDirectory: null,
        frameworkVersion: null,
      };
    }

    // Generic Python
    return {
      framework: "python",
      displayName: "Python",
      confidence: 0.6,
      detectedBy: hasRequirements ? "requirements.txt found" : "pyproject.toml found",
      defaultPort: 8000,
      hasDockerfile: false,
      packageManager: "pip",
      buildCommand: null,
      startCommand: "python main.py",
      installCommand: hasRequirements ? "pip install -r requirements.txt" : "pip install -e .",
      devCommand: null,
      outputDirectory: null,
      frameworkVersion: null,
    };
  }

  private extractVersion(_deps: Set<string>, _name: string): string | null {
    // Simple extraction - not fully implemented
    return null;
  }

  // -------------------------------------------------------------------------
  // Java detection
  // -------------------------------------------------------------------------

  private async detectJava(projectPath: string): Promise<DetectionResult | null> {
    const hasPom = await this.fileExists(path.join(projectPath, "pom.xml"));
    const hasGradle = await this.fileExists(path.join(projectPath, "build.gradle"));
    const hasGradleKts = await this.fileExists(
      path.join(projectPath, "build.gradle.kts")
    );

    if (!hasPom && !hasGradle && !hasGradleKts) return null;

    // Detect Spring Boot
    let isSpringBoot = false;
    if (hasPom) {
      const pomContent = await this.readFileSafe(path.join(projectPath, "pom.xml"));
      if (pomContent) {
        isSpringBoot =
          pomContent.includes("spring-boot") || pomContent.includes("spring-boot-starter");
      }
    }
    if (hasGradle || hasGradleKts) {
      const gradleContent = await this.readFileSafe(
        path.join(projectPath, hasGradleKts ? "build.gradle.kts" : "build.gradle")
      );
      if (gradleContent) {
        isSpringBoot =
          gradleContent.includes("spring-boot") || gradleContent.includes("org.springframework.boot");
      }
    }

    if (isSpringBoot) {
      return {
        framework: "springboot",
        displayName: "Spring Boot",
        confidence: 0.9,
        detectedBy: hasPom
          ? "pom.xml → Spring Boot dependencies"
          : "build.gradle → Spring Boot dependencies",
        defaultPort: 8080,
        hasDockerfile: false,
        packageManager: hasPom ? "maven" : "gradle",
        buildCommand: hasPom
          ? "./mvnw package -DskipTests"
          : "./gradlew build -x test",
        startCommand: "java -jar target/*.jar",
        installCommand: hasPom ? "./mvnw install" : "./gradlew dependencies",
        devCommand: hasPom ? "./mvnw spring-boot:run" : "./gradlew bootRun",
        outputDirectory: "target",
        frameworkVersion: null,
      };
    }

    // Generic Maven/Gradle
    if (hasPom) {
      return {
        framework: "maven",
        displayName: "Java Maven",
        confidence: 0.7,
        detectedBy: "pom.xml found",
        defaultPort: 8080,
        hasDockerfile: false,
        packageManager: "maven",
        buildCommand: "./mvnw package -DskipTests",
        startCommand: "java -jar target/*.jar",
        installCommand: "./mvnw install",
        devCommand: null,
        outputDirectory: "target",
        frameworkVersion: null,
      };
    }

    return {
      framework: "gradle",
      displayName: "Java Gradle",
      confidence: 0.7,
      detectedBy: "build.gradle found",
      defaultPort: 8080,
      hasDockerfile: false,
      packageManager: "gradle",
      buildCommand: "./gradlew build -x test",
      startCommand: "java -jar build/libs/*.jar",
      installCommand: "./gradlew dependencies",
      devCommand: null,
      outputDirectory: "build",
      frameworkVersion: null,
    };
  }

  // -------------------------------------------------------------------------
  // Go detection
  // -------------------------------------------------------------------------

  private async detectGo(projectPath: string): Promise<DetectionResult | null> {
    if (!(await this.fileExists(path.join(projectPath, "go.mod")))) return null;

    const goModContent = await this.readFileSafe(path.join(projectPath, "go.mod"));
    const goVersion = goModContent?.match(/go\s+([0-9]+\.[0-9]+)/)?.[1] ?? null;

    return {
      framework: "go",
      displayName: "Go",
      confidence: 0.95,
      detectedBy: "go.mod found",
      defaultPort: 8080,
      hasDockerfile: false,
      packageManager: "go",
      buildCommand: "go build -o server .",
      startCommand: "./server",
      installCommand: "go mod download",
      devCommand: "go run .",
      outputDirectory: null,
      frameworkVersion: goVersion,
    };
  }

  // -------------------------------------------------------------------------
  // Rust detection
  // -------------------------------------------------------------------------

  private async detectRust(projectPath: string): Promise<DetectionResult | null> {
    if (!(await this.fileExists(path.join(projectPath, "Cargo.toml")))) return null;

    const cargoContent = await this.readFileSafe(path.join(projectPath, "Cargo.toml"));
    const version = cargoContent?.match(/version\s*=\s*"([0-9]+\.[0-9]+[0-9.]*)"/)?.[1] ?? null;

    return {
      framework: "rust",
      displayName: "Rust",
      confidence: 0.95,
      detectedBy: "Cargo.toml found",
      defaultPort: 8080,
      hasDockerfile: false,
      packageManager: "cargo",
      buildCommand: "cargo build --release",
      startCommand: "target/release/server",
      installCommand: "cargo fetch",
      devCommand: "cargo run",
      outputDirectory: "target/release",
      frameworkVersion: version,
    };
  }

  // -------------------------------------------------------------------------
  // PHP detection
  // -------------------------------------------------------------------------

  private async detectPhp(projectPath: string): Promise<DetectionResult | null> {
    if (!(await this.fileExists(path.join(projectPath, "composer.json")))) return null;

    const composerJson = await this.readJson<Record<string, unknown>>(
      path.join(projectPath, "composer.json")
    );
    const deps = composerJson?.["require"] as Record<string, string> | undefined;
    const hasLaravel = deps && ("laravel/framework" in deps || "laravel/laravel" in deps);

    if (hasLaravel) {
      return {
        framework: "laravel",
        displayName: "Laravel",
        confidence: 0.9,
        detectedBy: "composer.json → laravel/framework dependency",
        defaultPort: 8000,
        hasDockerfile: false,
        packageManager: "composer",
        buildCommand: "npm run build && composer dump-autoload --optimize",
        startCommand: "php artisan serve --host=0.0.0.0 --port=8000",
        installCommand: "composer install",
        devCommand: "php artisan serve --host=0.0.0.0 --port=8000",
        outputDirectory: "public/build",
        frameworkVersion: null,
      };
    }

    return {
      framework: "php",
      displayName: "PHP",
      confidence: 0.6,
      detectedBy: "composer.json found",
      defaultPort: 8000,
      hasDockerfile: false,
      packageManager: "composer",
      buildCommand: null,
      startCommand: "php -S 0.0.0.0:8000 -t public",
      installCommand: "composer install",
      devCommand: null,
      outputDirectory: null,
      frameworkVersion: null,
    };
  }

  // -------------------------------------------------------------------------
  // Main detection
  // -------------------------------------------------------------------------

  async detect(projectPath: string): Promise<DetectionResult> {
    logger.info({ projectPath }, "Starting framework detection");

    // Step 1: Check for existing Dockerfile
    const hasDockerfile = await this.fileExists(
      path.join(projectPath, "Dockerfile")
    );
    if (hasDockerfile) {
      logger.info("Found Dockerfile — using custom framework");
      return {
        framework: "custom",
        displayName: "Custom Dockerfile",
        confidence: 1.0,
        detectedBy: "Dockerfile",
        defaultPort: 3000,
        hasDockerfile: true,
        packageManager: null,
        buildCommand: null,
        startCommand: null,
        installCommand: null,
        devCommand: null,
        outputDirectory: null,
        frameworkVersion: null,
      };
    }

    // Step 2: Node.js projects
    const hasPackageJson = await this.fileExists(
      path.join(projectPath, "package.json")
    );
    if (hasPackageJson) {
      logger.info("Found package.json — analyzing Node.js project");
      const { pkg, deps } = await this.parseNodeDeps(projectPath);
      const config = await this.detectNodeConfig(projectPath);
      const packageManager = await this.detectPackageManager(projectPath, pkg);
      const commands = this.detectNodeCommands(pkg);

      // Override install command based on detected package manager
      commands.installCommand = this.getInstallCommand(packageManager);

      // Nuxt (check before Vue/React since it uses Vue)
      if (config.hasNuxt || deps.all.has("nuxt")) {
        logger.info("Detected Nuxt framework");
        return this.buildResult({
          framework: "nuxt",
          displayName: "Nuxt",
          confidence: 0.95,
          detectedBy: config.hasNuxt ? "nuxt.config.* found" : "nuxt dependency in package.json",
          defaultPort: 3000,
          packageManager,
          buildCommand: "nuxt build",
          startCommand: "node .output/server/index.mjs",
          devCommand: "nuxt dev",
          outputDirectory: ".output",
        });
      }

      // Next.js
      if (config.hasNext || deps.all.has("next")) {
        logger.info("Detected Next.js framework");
        return this.buildResult({
          framework: "nextjs",
          displayName: "Next.js",
          confidence: 0.95,
          detectedBy: config.hasNext ? "next.config.* found" : "next dependency in package.json",
          defaultPort: 3000,
          packageManager,
          buildCommand: "next build",
          startCommand: "next start",
          devCommand: "next dev",
          outputDirectory: ".next",
        });
      }

      // Astro
      if (config.hasAstro || deps.all.has("astro")) {
        logger.info("Detected Astro framework");
        return this.buildResult({
          framework: "astro",
          displayName: "Astro",
          confidence: 0.95,
          detectedBy: config.hasAstro ? "astro.config.* found" : "astro dependency in package.json",
          defaultPort: 4321,
          packageManager,
          buildCommand: "astro build",
          startCommand: "node dist/server/entry.mjs",
          devCommand: "astro dev",
          outputDirectory: "dist",
        });
      }

      // SvelteKit
      if (config.hasSvelte || deps.all.has("@sveltejs/kit")) {
        logger.info("Detected SvelteKit framework");
        return this.buildResult({
          framework: "sveltekit",
          displayName: "SvelteKit",
          confidence: 0.95,
          detectedBy: config.hasSvelte ? "svelte.config.* found" : "@sveltejs/kit dependency",
          defaultPort: 5173,
          packageManager,
          buildCommand: "vite build",
          startCommand: "node build",
          devCommand: "vite dev",
          outputDirectory: "build",
        });
      }

      // React (Vite)
      if (config.hasVite && config.viteFramework === "react-vite") {
        logger.info("Detected React + Vite");
        return this.buildResult({
          framework: "react-vite",
          displayName: "React (Vite)",
          confidence: 0.95,
          detectedBy: "vite.config.* with @vitejs/plugin-react",
          defaultPort: 5173,
          packageManager,
          buildCommand: "vite build",
          startCommand: "vite preview --host 0.0.0.0",
          devCommand: "vite dev",
          outputDirectory: "dist",
        });
      }

      // React (CRA)
      if (config.hasCra) {
        logger.info("Detected React (Create React App)");
        return this.buildResult({
          framework: "react-cra",
          displayName: "React (CRA)",
          confidence: 0.9,
          detectedBy: "react-scripts dependency",
          defaultPort: 3000,
          packageManager,
          buildCommand: "react-scripts build",
          startCommand: "npx serve -s build",
          devCommand: "react-scripts start",
          outputDirectory: "build",
        });
      }

      // Vue (Vite)
      if (config.hasVite && config.viteFramework === "vue-vite") {
        logger.info("Detected Vue + Vite");
        return this.buildResult({
          framework: "vue-vite",
          displayName: "Vue (Vite)",
          confidence: 0.95,
          detectedBy: "vite.config.* with @vitejs/plugin-vue",
          defaultPort: 5173,
          packageManager,
          buildCommand: "vite build",
          startCommand: "vite preview --host 0.0.0.0",
          devCommand: "vite dev",
          outputDirectory: "dist",
        });
      }

      // Vue (Vue CLI)
      if (config.hasVue || deps.all.has("vue")) {
        logger.info("Detected Vue");
        return this.buildResult({
          framework: "vue",
          displayName: "Vue",
          confidence: 0.85,
          detectedBy: deps.all.has("vue") ? "vue dependency in package.json" : "vue.config.* found",
          defaultPort: 8080,
          packageManager,
          buildCommand: "vue-cli-service build",
          startCommand: "vue-cli-service serve",
          devCommand: "vue-cli-service serve",
          outputDirectory: "dist",
        });
      }

      // React (generic)
      if (deps.all.has("react") || deps.all.has("react-dom")) {
        logger.info("Detected React (generic)");
        return this.buildResult({
          framework: "react",
          displayName: "React",
          confidence: 0.8,
          detectedBy: "react / react-dom dependency in package.json",
          defaultPort: 5173,
          packageManager,
          buildCommand: commands.buildCommand ?? "vite build",
          startCommand: commands.startCommand ?? "vite preview --host 0.0.0.0",
          devCommand: commands.devCommand ?? "vite dev",
          outputDirectory: commands.outputDirectory ?? "dist",
        });
      }

      // NestJS
      if (deps.all.has("@nestjs/core")) {
        logger.info("Detected NestJS");
        return this.buildResult({
          framework: "nestjs",
          displayName: "NestJS",
          confidence: 0.95,
          detectedBy: "@nestjs/core dependency in package.json",
          defaultPort: 3000,
          packageManager,
          buildCommand: "nest build",
          startCommand: "node dist/main",
          devCommand: "nest start --watch",
          outputDirectory: "dist",
        });
      }

      // Express
      if (deps.all.has("express")) {
        logger.info("Detected Express");
        return this.buildResult({
          framework: "express",
          displayName: "Express",
          confidence: 0.9,
          detectedBy: "express dependency in package.json",
          defaultPort: 3000,
          packageManager,
          buildCommand: commands.buildCommand,
          startCommand: commands.startCommand ?? "node src/index.js",
          devCommand: commands.devCommand ?? "node src/index.js",
          outputDirectory: null,
        });
      }

      // Generic Node.js
      logger.info("Detected generic Node.js project");
      return this.buildResult({
        framework: "node",
        displayName: "Node.js",
        confidence: 0.6,
        detectedBy: "package.json present (no specific framework detected)",
        defaultPort: 3000,
        packageManager,
        buildCommand: commands.buildCommand,
        startCommand: commands.startCommand ?? "node src/index.js",
        devCommand: commands.devCommand,
        outputDirectory: commands.outputDirectory,
      });
    }

    // Step 3: Python
    const pythonResult = await this.detectPython(projectPath);
    if (pythonResult) {
      logger.info({ framework: pythonResult.displayName }, "Detected Python project");
      return pythonResult;
    }

    // Step 4: Java
    const javaResult = await this.detectJava(projectPath);
    if (javaResult) {
      logger.info({ framework: javaResult.displayName }, "Detected Java project");
      return javaResult;
    }

    // Step 5: Go
    const goResult = await this.detectGo(projectPath);
    if (goResult) {
      logger.info("Detected Go project");
      return goResult;
    }

    // Step 6: Rust
    const rustResult = await this.detectRust(projectPath);
    if (rustResult) {
      logger.info("Detected Rust project");
      return rustResult;
    }

    // Step 7: PHP
    const phpResult = await this.detectPhp(projectPath);
    if (phpResult) {
      logger.info({ framework: phpResult.displayName }, "Detected PHP project");
      return phpResult;
    }

    // Step 8: Static HTML
    if (await this.fileExists(path.join(projectPath, "index.html"))) {
      logger.info("Found index.html — static HTML site");
      return {
        framework: "static",
        displayName: "Static HTML",
        confidence: 0.6,
        detectedBy: "index.html present (no package.json)",
        defaultPort: 80,
        hasDockerfile: false,
        packageManager: null,
        buildCommand: null,
        startCommand: null,
        installCommand: null,
        devCommand: null,
        outputDirectory: null,
        frameworkVersion: null,
      };
    }

    throw new FrameworkDetectionError(
      "Unable to detect framework. Ensure the repository contains a supported project structure."
    );
  }

  // -------------------------------------------------------------------------
  // Helpers for building results
  // -------------------------------------------------------------------------

  private buildResult(params: {
    framework: string;
    displayName: string;
    confidence: number;
    detectedBy: string;
    defaultPort: number;
    packageManager: string | null;
    buildCommand: string | null;
    startCommand: string | null;
    devCommand: string | null;
    outputDirectory: string | null;
  }): DetectionResult {
    return {
      ...params,
      hasDockerfile: false,
      installCommand: this.getInstallCommand(params.packageManager),
      frameworkVersion: null,
    };
  }

  private getInstallCommand(packageManager: string | null): string {
    switch (packageManager) {
      case "yarn":
        return "yarn install";
      case "pnpm":
        return "pnpm install";
      case "bun":
        return "bun install";
      case "npm":
      default:
        return "npm install";
    }
  }
}

export const frameworkDetector = new FrameworkDetector();
