import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";

const HOSTS_PATH = path.join(
  process.env["SYSTEMROOT"] || "C:\\Windows",
  "System32", "drivers", "etc", "hosts"
);
const HOSTS_MARKER = "# RYME managed";

/**
 * HostsManager manages Windows hosts file entries for *.localhost DNS resolution.
 *
 * On Windows, *.localhost domains don't resolve automatically.
 * This service adds entries like:
 *   127.0.0.1  ryme-test-app.localhost
 *
 * Entries are marked with a comment so they can be identified and cleaned up.
 */
export class HostsManager {
  /**
   * Ensures a DNS entry exists for the given hostname.
   * Adds `127.0.0.1 <hostname>` to the hosts file if not present.
   *
   * @param hostname - The hostname to add (e.g., "ryme-test-app.localhost")
   * @returns "added" if entry was added, "exists" if already present, "error" if failed
   */
  async ensureEntry(hostname: string): Promise<"added" | "exists" | "error"> {
    try {
      const content = await fs.readFile(HOSTS_PATH, "utf-8");

      // Check if entry already exists (exact line match)
      const entryLine = `127.0.0.1\t${hostname}`;
      const entryLineSpaces = `127.0.0.1  ${hostname}`;
      if (content.includes(entryLine) || content.includes(entryLineSpaces)) {
        logger.debug({ hostname }, "DNS entry already exists in hosts file");
        return "exists";
      }

      // Append the new entry
      const newEntry = `\n${HOSTS_MARKER}\n127.0.0.1\t${hostname}\n${HOSTS_MARKER}\n`;
      await fs.appendFile(HOSTS_PATH, newEntry, "utf-8");

      logger.info({ hostname }, "Added DNS entry to hosts file");
      return "added";
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      if (msg.includes("EACCES") || msg.includes("permission")) {
        logger.warn(
          { hostname },
          `Cannot modify hosts file (run as Administrator). Add manually: 127.0.0.1  ${hostname}`
        );
      } else {
        logger.error({ hostname, error: msg }, "Failed to modify hosts file");
      }
      return "error";
    }
  }

  /**
   * Removes the DNS entry for the given hostname from the hosts file.
   *
   * @param hostname - The hostname to remove
   * @returns true if entry was removed, false if not found
   */
  async removeEntry(hostname: string): Promise<boolean> {
    try {
      const content = await fs.readFile(HOSTS_PATH, "utf-8");
      const lines = content.split("\n");

      const entryPattern1 = `127.0.0.1\t${hostname}`;
      const entryPattern2 = `127.0.0.1  ${hostname}`;
      const markerLine = HOSTS_MARKER;

      let found = false;
      const newLines: string[] = [];
      let skipUntilNextMarker = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip RYME marker lines
        if (trimmed === markerLine) {
          if (!found) {
            // First marker — start of a RYME block
            // Check if the next non-empty line is our entry
            continue;
          }
          // Second marker — end of block
          skipUntilNextMarker = false;
          continue;
        }

        // Check if this line is our entry
        if (trimmed === entryPattern1 || trimmed === entryPattern2) {
          found = true;
          continue; // Skip this line
        }

        // Skip empty lines between markers (they belong to the block)
        if (skipUntilNextMarker && trimmed === "") {
          continue;
        }

        newLines.push(line);
      }

      if (!found) {
        logger.debug({ hostname }, "DNS entry not found in hosts file");
        return false;
      }

      await fs.writeFile(HOSTS_PATH, newLines.join("\n"), "utf-8");
      logger.info({ hostname }, "Removed DNS entry from hosts file");
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "unknown";
      logger.warn({ hostname, error: msg }, "Failed to remove entry from hosts file");
      return false;
    }
  }

  /**
   * Checks if a DNS entry exists for the given hostname.
   */
  async hasEntry(hostname: string): Promise<boolean> {
    try {
      const content = await fs.readFile(HOSTS_PATH, "utf-8");
      const entryLine = `127.0.0.1\t${hostname}`;
      const entryLineSpaces = `127.0.0.1  ${hostname}`;
      return content.includes(entryLine) || content.includes(entryLineSpaces);
    } catch {
      return false;
    }
  }
}

export const hostsManager = new HostsManager();
