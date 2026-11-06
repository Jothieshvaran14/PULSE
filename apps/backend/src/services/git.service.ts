import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";
import fs from "node:fs/promises";
import path from "node:path";
import { GitError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * GitService handles all Git operations for PULSE.
 *
 * Uses simple-git (a Node.js wrapper around git CLI) instead of raw
 * child_process to benefit from structured output and error handling.
 * Repository URLs are validated before cloning to prevent injection.
 */
export class GitService {
  /**
   * Validates that a URL is a legitimate GitHub HTTPS URL.
   * Prevents SSRF, local file access, and SSH-based attacks.
   */
  private validateUrl(url: string): void {
    const pattern =
      /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
    if (!pattern.test(url)) {
      throw new GitError(
        `Invalid repository URL. Only HTTPS GitHub URLs are accepted: ${url}`
      );
    }
  }

  /**
   * Validates the clone destination path to prevent path traversal.
   * The destination must be within the expected workspace directory.
   */
  private validateDestination(dest: string, baseDir: string): void {
    const resolved = path.resolve(dest);
    const resolvedBase = path.resolve(baseDir);
    if (!resolved.startsWith(resolvedBase)) {
      throw new GitError(
        "Clone destination is outside the allowed workspace directory"
      );
    }
  }

  /**
   * Injects a GitHub PAT into the repository URL for private repo access.
   * Format: https://{token}@github.com/owner/repo
   */
  private injectToken(url: string, token: string): string {
    return url.replace("https://github.com/", `https://${token}@github.com/`);
  }

  /**
   * Clones a GitHub repository to the specified directory.
   *
   * @param repoUrl - GitHub HTTPS URL
   * @param branch - Branch to clone
   * @param destPath - Absolute path to clone into
   * @param baseDir - Workspace base directory (for path traversal validation)
   * @param token - Optional GitHub PAT for private repos
   * @returns Commit hash of the cloned HEAD
   */
  async clone(
    repoUrl: string,
    branch: string,
    destPath: string,
    baseDir: string,
    token?: string
  ): Promise<{ commitHash: string; clonePath: string }> {
    this.validateUrl(repoUrl);
    this.validateDestination(destPath, baseDir);

    const cloneUrl = token ? this.injectToken(repoUrl, token) : repoUrl;

    // Ensure destination directory exists
    await fs.mkdir(destPath, { recursive: true });

    const gitOptions: Partial<SimpleGitOptions> = {
      baseDir: destPath,
      maxConcurrentProcesses: 1,
      timeout: {
        block: 120000, // 2 minutes for clone operations
      },
    };

    const simpleGitFunc = simpleGit as unknown as (options: Partial<SimpleGitOptions>) => SimpleGit;
    const git: SimpleGit = simpleGitFunc(gitOptions);

    try {
      logger.info({ repoUrl, branch, destPath }, "Cloning repository");

      await git.clone(cloneUrl, ".", [
        "--branch",
        branch,
        "--depth",
        "1",
        "--single-branch",
      ]);

      const log = await git.log(["-1"]);
      const commitHash = log.latest?.hash ?? "unknown";

      logger.info({ commitHash }, "Repository cloned successfully");

      return { commitHash, clonePath: destPath };
    } catch (error) {
      // Clean up partially cloned directory
      await fs.rm(destPath, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors
      });

      const message =
        error instanceof Error ? error.message : "Unknown git error";

      // Sanitize error message to remove token if present
      const sanitizedMessage = token
        ? message.replace(new RegExp(token, "g"), "***")
        : message;

      if (sanitizedMessage.includes("not found") || sanitizedMessage.includes("404")) {
        throw new GitError(
          `Repository not found: ${repoUrl}. Check the URL and ensure the repository exists.`
        );
      }

      if (
        sanitizedMessage.includes("Authentication") ||
        sanitizedMessage.includes("403") ||
        sanitizedMessage.includes("401")
      ) {
        throw new GitError(
          `Authentication failed for ${repoUrl}. Check your GitHub token.`
        );
      }

      throw new GitError(`Failed to clone repository: ${sanitizedMessage}`);
    }
  }

  /**
   * Cleans up a cloned workspace directory.
   */
  async cleanup(workspacePath: string): Promise<void> {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      logger.debug({ workspacePath }, "Workspace cleaned up");
    } catch (error) {
      logger.warn({ error, workspacePath }, "Failed to clean up workspace");
    }
  }
}

export const gitService = new GitService();
