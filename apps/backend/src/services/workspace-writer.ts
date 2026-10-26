import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";

/**
 * Result of writing files to a workspace.
 */
export interface WriteResult {
  dockerfilePath: string;
  nginxConfPath: string | null;
}

/**
 * Default .dockerignore content.
 */
const DOCKERIGNORE_CONTENT = [
  "node_modules",
  ".git",
  ".gitignore",
  ".env",
  ".env.*",
  "*.md",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  "*.pyc",
  ".tox",
  ".mypy_cache",
  "target/debug",
  "target/.fingerprint",
  "target/.rustc_info.json",
].join("\n");

/**
 * WorkspaceWriter handles all file system operations for deployment artifacts.
 *
 * Single responsibility: writing rendered templates to disk.
 * Never reads templates or handles logic — only writes.
 */
export class WorkspaceWriter {
  /**
   * Write Dockerfile, optional nginx.conf, and .dockerignore to the workspace directory.
   *
   * @param workspacePath - Root of the project workspace (where Dockerfile is written)
   * @param dockerfile - Rendered Dockerfile content
   * @param nginxConf - Rendered nginx.conf content (if applicable)
   * @returns Paths to the written files
   */
  async write(
    workspacePath: string,
    dockerfile: string,
    nginxConf: string | null
  ): Promise<WriteResult> {
    const dockerfilePath = path.join(workspacePath, "Dockerfile");
    let nginxConfPath: string | null = null;

    // Write Dockerfile
    await fs.writeFile(dockerfilePath, dockerfile, "utf-8");
    logger.debug({ path: dockerfilePath }, "Wrote Dockerfile");

    // Write nginx.conf if present
    if (nginxConf) {
      nginxConfPath = path.join(workspacePath, "nginx.conf");
      await fs.writeFile(nginxConfPath, nginxConf, "utf-8");
      logger.debug({ path: nginxConfPath }, "Wrote nginx.conf");
    }

    // Write .dockerignore if it doesn't exist
    await this.writeDockerignore(workspacePath);

    return { dockerfilePath, nginxConfPath };
  }

  /**
   * Writes a .dockerignore file if one doesn't already exist.
   */
  private async writeDockerignore(workspacePath: string): Promise<void> {
    const dockerignorePath = path.join(workspacePath, ".dockerignore");
    try {
      await fs.access(dockerignorePath);
    } catch {
      await fs.writeFile(dockerignorePath, DOCKERIGNORE_CONTENT, "utf-8");
      logger.debug({ path: dockerignorePath }, "Wrote .dockerignore");
    }
  }

  /**
   * Clean up generated files from the workspace (rollback helper).
   */
  async cleanup(workspacePath: string): Promise<void> {
    const files = ["Dockerfile", "nginx.conf", ".dockerignore"];
    for (const file of files) {
      const filePath = path.join(workspacePath, file);
      try {
        await fs.unlink(filePath);
        logger.debug({ path: filePath }, "Removed generated file");
      } catch {
        // File may not exist — ignore
      }
    }
  }
}

export const workspaceWriter = new WorkspaceWriter();
