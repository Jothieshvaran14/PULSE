import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { logger } from "../lib/logger.js";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface CommandExecutorOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

/**
 * Whitelist of environment variables allowed in child processes.
 * Prevents leaking secrets (DATABASE_URL, JWT_SECRET, etc.) to build tools.
 */
const ALLOWED_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
  "npm_config_cache",
  "npm_config_registry",
  "YARN_CACHE_FOLDER",
  "PNPM_HOME",
  "COREPACK_ENABLE_STRICT",
  "CI",
  "TMPDIR",
  "TEMP",
  "TMP",
]);

/**
 * CommandExecutor runs shell commands with live streaming output.
 *
 * Uses child_process.spawn with shell: false for security.
 * On Windows, commands are executed via cmd.exe /c (explicit, not shell:true)
 * because .cmd files (npm, vite, next, etc.) require the Windows command
 * interpreter. Shell metacharacters are rejected upstream in parseCommand,
 * so cmd.exe cannot be used for injection.
 * On Linux/macOS, commands spawn directly.
 */
export class CommandExecutor {
  /**
   * Executes a command and streams output line-by-line.
   *
   * @param command - The executable to run (e.g., "npm")
   * @param args - Arguments (e.g., ["install"])
   * @param options - Execution options
   * @returns Promise resolving to the command result
   */
  async execute(
    command: string,
    args: string[],
    options: CommandExecutorOptions
  ): Promise<CommandResult> {
    const { cwd, env, timeoutMs, onStdout, onStderr } = options;

    return new Promise<CommandResult>((resolve) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let killed = false;

      // Build whitelisted environment
      const childEnv: Record<string, string> = {};
      for (const key of ALLOWED_ENV_KEYS) {
        const val = process.env[key];
        if (val !== undefined) {
          childEnv[key] = val;
        }
      }
      // Apply any explicitly provided env vars
      if (env) {
        for (const [key, val] of Object.entries(env)) {
          if (ALLOWED_ENV_KEYS.has(key)) {
            childEnv[key] = val;
          }
        }
      }

      // Prepend node_modules/.bin to PATH so local binaries (vite, next, etc.) are found
      const localBin = path.join(cwd, "node_modules", ".bin");
      const separator = process.platform === "win32" ? ";" : ":";
      childEnv["PATH"] = `${localBin}${separator}${childEnv["PATH"] ?? process.env.PATH ?? ""}`;

      // On Windows, use cmd.exe /c to handle .cmd scripts and PATH resolution.
      // This is safe because parseCommand rejects shell metacharacters upstream.
      // On Linux/macOS, spawn directly.
      let child: ChildProcess;
      if (process.platform === "win32") {
        logger.info(
          { command, args, cwd },
          `Resolved executable: cmd.exe /c ${command}`
        );
        child = spawn("cmd.exe", ["/c", command, ...args], {
          cwd,
          env: childEnv,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } else {
        logger.info(
          { command, args, cwd },
          `Resolved executable: ${command}`
        );
        child = spawn(command, args, {
          cwd,
          env: childEnv,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      }

      // Timeout handler
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs && timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          killed = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              // Process may already be dead
            }
          }, 5000);
        }, timeoutMs);
      }

      // Handle stdout
      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString("utf-8");
        stdout += text;
        const lines = text.split("\n").filter((l) => l.length > 0);
        for (const line of lines) {
          onStdout?.(line);
        }
      });

      // Handle stderr
      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString("utf-8");
        stderr += text;
        const lines = text.split("\n").filter((l) => l.length > 0);
        for (const line of lines) {
          onStderr?.(line);
        }
      });

      // Handle close
      child.on("close", (code) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        const durationMs = Date.now() - startTime;
        const exitCode = code ?? 1;

        if (killed) {
          logger.warn(
            { command, args, durationMs },
            "Command killed due to timeout"
          );
          resolve({
            exitCode: 1,
            stdout,
            stderr: stderr + "\nCommand killed: execution timed out",
            durationMs,
          });
          return;
        }

        logger.info(
          { command, args, exitCode, durationMs },
          "Command completed"
        );

        resolve({
          exitCode,
          stdout,
          stderr,
          durationMs,
        });
      });

      // Handle spawn error (command not found, etc.)
      child.on("error", (error) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        const durationMs = Date.now() - startTime;
        logger.error({ command, args, error: error.message }, "Command failed to start");
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + "\n" + error.message,
          durationMs,
        });
      });
    });
  }
}

export const commandExecutor = new CommandExecutor();
