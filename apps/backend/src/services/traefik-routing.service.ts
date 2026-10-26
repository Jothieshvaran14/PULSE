import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseDocument } from "yaml";
import type { Document } from "yaml";
import { logger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);

/**
 * Manages Traefik dynamic routing via a single routes.yml file.
 *
 * Traefik's file provider replaces the entire config when any file changes,
 * so ALL routes must live in one file. This service maintains routes.yml
 * with all active deployments.
 *
 * Dashboard config lives separately in dashboard.yml (never touched).
 *
 * Routes file: docker/traefik/dynamic/routes.yml
 *
 * ---------------------------------------------------------------------------
 * Parsing strategy (rewritten in Phase 0.1 — see docs/pulse/PULSE-11)
 * ---------------------------------------------------------------------------
 * The original hand-rolled line parser silently DROPPED data:
 *   - the last router in the file was never flushed when the services section
 *     followed it (D-A),
 *   - `entryPoints` list items were never parsed (D-B),
 *   - router entries eroded on every read/write round-trip (D-C),
 *   - any field it did not know (priority, middlewares, tls, ...) was lost.
 *
 * The service now round-trips the file through a real YAML Document
 * (`yaml` package): comments, unknown routers/services/sections, nested
 * values, quoting styles and entry points are all preserved; only the router
 * or service entry being explicitly added/removed is rewritten.
 */
export class TraefikRoutingService {
  private dynamicDir: string;
  private routesFile: string;

  constructor() {
    this.dynamicDir = path.resolve(
      process.cwd(),
      "../../docker/traefik/dynamic"
    );
    this.routesFile = path.join(this.dynamicDir, "routes.yml");
  }

  /**
   * Adds or updates a route for a deployment.
   * Reads existing routes, adds/updates the entry, writes back.
   * Only the named router/service entry is modified — every other key in the
   * document (including the dashboard router, operators' middlewares, TLS
   * blocks and any unknown fields) is preserved verbatim.
   */
  async addRoute(
    projectName: string,
    hostname: string,
    containerName: string,
    containerPort: number
  ): Promise<void> {
    const routerName = projectName.replace(/[^a-zA-Z0-9-]/g, "-");
    const doc = await this.readRoutes();
    this.ensureHttp(doc);

    doc.setIn(["http", "routers", routerName], {
      rule: `Host(\`${hostname}\`)`,
      entryPoints: ["web"],
      service: routerName,
    });

    doc.setIn(["http", "services", routerName], {
      loadBalancer: {
        servers: [{ url: `http://${containerName}:${containerPort}` }],
      },
    });

    await this.writeRoutes(doc);
    await this.restartTraefik();

    logger.info(
      { projectName, hostname, containerName, containerPort },
      "Traefik route added"
    );
  }

  /**
   * Removes a route for a deployment.
   * Only the named entries are removed; everything else is untouched.
   */
  async removeRoute(projectName: string): Promise<void> {
    const routerName = projectName.replace(/[^a-zA-Z0-9-]/g, "-");
    const doc = await this.readRoutes();

    // Nothing to remove if the document has no http section at all.
    if (!doc.get("http")) {
      logger.info({ projectName }, "Traefik route removed (no routes file)");
      return;
    }

    doc.deleteIn(["http", "routers", routerName]);
    doc.deleteIn(["http", "services", routerName]);

    await this.writeRoutes(doc);
    await this.restartTraefik();

    logger.info({ projectName }, "Traefik route removed");
  }

  /**
   * Restarts Traefik to pick up route changes.
   * Docker Desktop volume mounts don't propagate inotify events,
   * so the file watcher doesn't trigger on Windows.
   */
  private async restartTraefik(): Promise<void> {
    try {
      await execFileAsync("docker", ["restart", "ryme-traefik"]);
      logger.info("Traefik restarted to pick up route changes");
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : "unknown" },
        "Failed to restart Traefik"
      );
    }
  }

  /**
   * Reads routes.yml into an editable YAML Document.
   * Returns a document containing the default dashboard route if the file
   * doesn't exist (same behavior as the original implementation, which always
   * regenerated the dashboard entry).
   */
  private async readRoutes(): Promise<Document.Parsed> {
    try {
      const content = await fs.readFile(this.routesFile, "utf-8");
      return this.parseRoutesYaml(content);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("ENOENT")) {
        return this.parseRoutesYaml(TRAEFIK_DEFAULT_ROUTES);
      }
      throw error;
    }
  }

  /**
   * Writes a YAML Document back to routes.yml.
   */
  private async writeRoutes(doc: Document.Parsed): Promise<void> {
    await fs.mkdir(this.dynamicDir, { recursive: true });
    await fs.writeFile(this.routesFile, this.generateRoutesYaml(doc), "utf-8");
  }

  /**
   * Parses routes.yml content into a YAML Document.
   *
   * Unlike the previous line-oriented parser this preserves the whole
   * document: routers, services, middlewares, TLS blocks, entry points,
   * comments, and any field/section this code does not understand.
   * Throws if the content is not valid YAML (fail-fast: a corrupt file must
   * not be silently overwritten with a lossy re-serialization).
   */
  parseRoutesYaml(content: string): Document.Parsed {
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
      throw new Error(`Invalid routes YAML: ${doc.errors[0]?.message ?? "parse error"}`);
    }
    return doc;
  }

  /**
   * Serializes a YAML Document back to file content.
   * Deterministic for a given document.
   */
  generateRoutesYaml(doc: Document.Parsed): string {
    const out = doc.toString();
    return out.endsWith("\n") ? out : `${out}\n`;
  }

  /**
   * Guarantees http.routers and http.services exist so setIn() has parents
   * to write into (handles empty files and partially-formed documents).
   */
  private ensureHttp(doc: Document.Parsed): void {
    if (!doc.get("http")) {
      doc.setIn(["http"], {});
    }
    if (!doc.getIn(["http", "routers"])) {
      doc.setIn(["http", "routers"], {});
    }
    if (!doc.getIn(["http", "services"])) {
      doc.setIn(["http", "services"], {});
    }
  }
}

/** Bootstrap content used when routes.yml does not exist yet. */
const TRAEFIK_DEFAULT_ROUTES = `http:
  routers:
    dashboard:
      rule: "Host(\`traefik.localhost\`)"
      entryPoints:
        - web
      service: api@internal
  services: {}
`;

export const traefikRouting = new TraefikRoutingService();
