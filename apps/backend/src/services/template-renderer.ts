import Handlebars from "handlebars";
import type { Template, TemplateMeta } from "./template-registry.js";
import type { DetectionResult } from "@pulse/shared";

/**
 * Result of rendering a template.
 */
export interface RenderResult {
  dockerfile: string;
  nginxConf: string | null;
  metadata: TemplateMeta;
}

/**
 * Context variables passed to Handlebars templates.
 */
export interface TemplateContext {
  framework: string;
  displayName: string;
  nodeVersion: string;
  pythonVersion: string;
  packageManager: string;
  installCmd: string;
  buildCmd: string;
  startCmd: string;
  startCmdArray: string;
  outputDir: string;
  containerPort: number;
  nginxConf: boolean;
  nginxConfPath: string;
  pmLockfile: string;
  extraInstallCmd: string;
  extraPostCopy: string;
}

/**
 * TemplateRenderer compiles Handlebars templates and produces rendered output.
 *
 * Single responsibility: template compilation and rendering.
 * Never writes files. Returns rendered content only.
 */
export class TemplateRenderer {
  /**
   * Render a template with the given detection context.
   *
   * @param template - The loaded template
   * @param detection - The framework detection result
   * @param projectName - The project name (for display in comments)
   * @returns Rendered Dockerfile and optional nginx.conf
   */
  render(
    template: Template,
    detection: DetectionResult,
    _projectName: string
  ): RenderResult {
    const context = this.buildContext(template.metadata, detection);

    // Render Dockerfile
    const dockerfileTemplate = Handlebars.compile(template.dockerfileHbs, {
      noEscape: true,
    });
    const dockerfile = dockerfileTemplate(context);

    // Render nginx.conf if template has one
    let nginxConf: string | null = null;
    if (template.nginxConfHbs) {
      const nginxTemplate = Handlebars.compile(template.nginxConfHbs, {
        noEscape: true,
      });
      nginxConf = nginxTemplate(context);
    }

    return {
      dockerfile,
      nginxConf,
      metadata: template.metadata,
    };
  }

  /**
   * Build the Handlebars context from metadata and detection results.
   */
  private buildContext(
    meta: TemplateMeta,
    detection: DetectionResult
  ): TemplateContext {
    const packageManager = detection.packageManager ?? "npm";

    return {
      framework: detection.framework,
      displayName: meta.displayName,
      nodeVersion: "20",
      pythonVersion: "3.12",
      packageManager,
      installCmd: this.getInstallCmd(detection),
      buildCmd: detection.buildCommand ?? "",
      startCmd: this.getStartCmd(detection),
      startCmdArray: this.getStartCmdArray(detection),
      outputDir: detection.outputDirectory ?? meta.outputDirectory,
      containerPort: meta.containerPort,
      nginxConf: meta.proxy === "nginx",
      nginxConfPath: "/etc/nginx/conf.d/default.conf",
      pmLockfile: this.getLockfile(packageManager),
      extraInstallCmd: this.getExtraInstallCmd(detection),
      extraPostCopy: this.getExtraPostCopy(detection),
    };
  }

  /**
   * Determine the install command from detection.
   */
  private getInstallCmd(detection: DetectionResult): string {
    if (detection.installCommand) return detection.installCommand;

    switch (detection.packageManager) {
      case "yarn":
        return "yarn install --frozen-lockfile";
      case "pnpm":
        return "pnpm install --frozen-lockfile";
      case "bun":
        return "bun install --frozen-lockfile";
      case "pip":
        return "pip install -r requirements.txt";
      default:
        return "npm ci";
    }
  }

  /**
   * Determine the start command from detection.
   */
  private getStartCmd(detection: DetectionResult): string {
    if (detection.startCommand) return detection.startCommand;

    switch (detection.framework) {
      case "express":
      case "nestjs":
        return "node server.js";
      case "node":
        return "node index.js";
      case "fastapi":
        return "uvicorn main:app --host 0.0.0.0 --port 8000";
      case "flask":
        return "gunicorn main:app --bind 0.0.0.0:5000";
      case "django":
        return "gunicorn myproject.wsgi:application --bind 0.0.0.0:8000";
      case "python":
        return "python main.py";
      case "go":
      case "rust":
        return "./server";
      default:
        return "node index.js";
    }
  }

  /**
   * Convert start command string to a JSON array for CMD.
   * E.g., "node server.js" → ["node", "server.js"]
   */
  private getStartCmdArray(detection: DetectionResult): string {
    const cmd = this.getStartCmd(detection);
    const parts = cmd.split(/\s+/);
    return JSON.stringify(parts);
  }

  /**
   * Get the lockfile name for the package manager.
   */
  private getLockfile(pm: string): string {
    switch (pm) {
      case "yarn":
        return "yarn.lock";
      case "pnpm":
        return "pnpm-lock.yaml";
      case "bun":
        return "bun.lockb";
      default:
        return "package-lock.json";
    }
  }

  /**
   * Get extra install commands for Python frameworks.
   */
  private getExtraInstallCmd(detection: DetectionResult): string {
    if (
      detection.framework === "flask" ||
      detection.framework === "django"
    ) {
      return "RUN pip install --no-cache-dir --user gunicorn";
    }
    return "";
  }

  /**
   * Get extra post-copy commands for Python frameworks.
   */
  private getExtraPostCopy(detection: DetectionResult): string {
    if (detection.framework === "django") {
      return "RUN if [ -f manage.py ]; then python manage.py collectstatic --noinput 2>/dev/null || true; fi";
    }
    return "";
  }
}

export const templateRenderer = new TemplateRenderer();
