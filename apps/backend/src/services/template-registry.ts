import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../templates");

/**
 * Template metadata loaded from template.json.
 */
export interface TemplateMeta {
  framework: string;
  version: number;
  displayName: string;
  category: "static" | "backend" | "fullstack";
  proxy: "nginx" | "none";
  containerPort: number;
  outputDirectory: string;
  healthCheckPath: string;
  supportsDockerfile: boolean;
  supportsRollback: boolean;
  supportsPreview: boolean;
}

/**
 * A fully loaded deployment template.
 */
export interface Template {
  metadata: TemplateMeta;
  dockerfileHbs: string;
  nginxConfHbs: string | null;
}

/**
 * TemplateRegistry loads, validates, and caches all deployment templates
 * from the templates/ directory on startup.
 *
 * Single responsibility: template discovery, loading, and caching.
 */
export class TemplateRegistry {
  private templates = new Map<string, Template>();

  /**
   * Scan the templates directory and load all valid templates.
   * Must be called once at server startup.
   */
  async loadAll(): Promise<{ loaded: number; failed: string[] }> {
    const failed: string[] = [];
    let loaded = 0;

    try {
      const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith("_")) continue;

        try {
          const template = await this.loadTemplate(entry.name);
          if (template) {
            this.templates.set(entry.name, template);
            loaded++;
          }
        } catch (error) {
          failed.push(entry.name);
          logger.warn(
            {
              template: entry.name,
              error: error instanceof Error ? error.message : "unknown",
            },
            "Failed to load template"
          );
        }
      }

      logger.info({ loaded, failed: failed.length }, "Templates loaded");
      return { loaded, failed };
    } catch (error) {
      throw new Error(
        `Failed to read templates directory: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Load a single template by framework name.
   */
  private async loadTemplate(framework: string): Promise<Template | null> {
    const dir = path.join(TEMPLATES_DIR, framework);

    // Load template.json (required)
    const metaPath = path.join(dir, "template.json");
    let metadata: TemplateMeta;
    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      metadata = JSON.parse(raw) as TemplateMeta;
    } catch {
      throw new Error(`Missing or invalid template.json for "${framework}"`);
    }

    // Validate required fields
    this.validateMetadata(metadata, framework);

    // Load Dockerfile.hbs (required)
    const dockerfilePath = path.join(dir, "Dockerfile.hbs");
    let dockerfileHbs: string;
    try {
      dockerfileHbs = await fs.readFile(dockerfilePath, "utf-8");
    } catch {
      throw new Error(`Missing Dockerfile.hbs for "${framework}"`);
    }

    // Load nginx.conf.hbs (optional — only if proxy is nginx)
    let nginxConfHbs: string | null = null;
    if (metadata.proxy === "nginx") {
      const nginxPath = path.join(dir, "nginx.conf.hbs");
      try {
        nginxConfHbs = await fs.readFile(nginxPath, "utf-8");
      } catch {
        throw new Error(
          `proxy is "nginx" but nginx.conf.hbs is missing for "${framework}"`
        );
      }
    }

    return { metadata, dockerfileHbs, nginxConfHbs };
  }

  /**
   * Validate required fields in template metadata.
   */
  private validateMetadata(meta: TemplateMeta, framework: string): void {
    const required: (keyof TemplateMeta)[] = [
      "framework",
      "version",
      "displayName",
      "category",
      "proxy",
      "containerPort",
      "outputDirectory",
      "healthCheckPath",
    ];

    for (const field of required) {
      if (meta[field] === undefined || meta[field] === null || meta[field] === "") {
        throw new Error(
          `Missing required field "${field}" in template.json for "${framework}"`
        );
      }
    }

    if (!["static", "backend", "fullstack"].includes(meta.category)) {
      throw new Error(
        `Invalid category "${meta.category}" in template.json for "${framework}"`
      );
    }

    if (!["nginx", "none"].includes(meta.proxy)) {
      throw new Error(
        `Invalid proxy "${meta.proxy}" in template.json for "${framework}"`
      );
    }
  }

  /**
   * Get a template by framework name.
   */
  get(framework: string): Template | undefined {
    return this.templates.get(framework);
  }

  /**
   * Check if a template exists for the given framework.
   */
  has(framework: string): boolean {
    return this.templates.has(framework);
  }

  /**
   * Get all loaded templates.
   */
  getAll(): Template[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get all loaded framework names.
   */
  getFrameworkNames(): string[] {
    return Array.from(this.templates.keys());
  }


}

export const templateRegistry = new TemplateRegistry();
