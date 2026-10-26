import { z } from "zod";

/**
 * Application configuration loaded from environment variables.
 *
 * Validated at startup with Zod — the application crashes immediately
 * if required configuration is missing, rather than failing later with
 * cryptic errors. This is the "fail fast" principle.
 */
const configSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().default("0.0.0.0"),

  databaseUrl: z.string().url(),

  dockerSocketPath: z.string().default("/var/run/docker.sock"),
  dockerNetwork: z.string().default("ryme-network"),
  dockerImagePrefix: z.string().default("ryme"),

  portRangeStart: z.coerce.number().int().min(1024).default(10000),
  portRangeEnd: z.coerce.number().int().max(65535).default(65000),

  workspaceDir: z.string().default("../../data/workspaces"),
  buildTimeoutMs: z.coerce.number().int().min(30000).default(600000),
  deployDomain: z.string().default("localhost"),

  templateDir: z.string().default("../../../../docker/templates"),

  githubClientId: z.string().optional(),
  githubClientSecret: z.string().optional(),
  githubToken: z.string().optional(),
  /**
   * Explicit opt-in for the development-only PAT login (POST /api/v1/dev/login).
   * Fail-closed: defaults to false, and the endpoint additionally requires
   * nodeEnv === "development" (see isDevLoginEnabled()).
   */
  enableDevLogin: z.boolean(),
  jwtSecret: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  jwtExpiresIn: z.string().default("24h"),
  frontendUrl: z.string().url("FRONTEND_URL must be a valid URL").default("http://localhost:5173"),
  tokenEncryptionKey: z.string().min(32, "TOKEN_ENCRYPTION_KEY must be at least 32 characters"),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse({
    nodeEnv: process.env["NODE_ENV"],
    port: process.env["BACKEND_PORT"],
    host: process.env["BACKEND_HOST"],
    databaseUrl: process.env["DATABASE_URL"],
    dockerSocketPath: process.env["DOCKER_SOCKET_PATH"],
    dockerNetwork: process.env["DOCKER_NETWORK"],
    dockerImagePrefix: process.env["DOCKER_IMAGE_PREFIX"],
    portRangeStart: process.env["PORT_RANGE_START"],
    portRangeEnd: process.env["PORT_RANGE_END"],
    workspaceDir: process.env["WORKSPACE_DIR"],
    buildTimeoutMs: process.env["BUILD_TIMEOUT_MS"],
    deployDomain: process.env["DEPLOY_DOMAIN"],
    templateDir: process.env["TEMPLATE_DIR"],
    githubClientId: process.env["GITHUB_CLIENT_ID"],
    githubClientSecret: process.env["GITHUB_CLIENT_SECRET"],
    githubToken: process.env["GITHUB_TOKEN"],
    enableDevLogin: process.env["ENABLE_DEV_LOGIN"] === "true",
    jwtSecret: process.env["JWT_SECRET"],
    jwtExpiresIn: process.env["JWT_EXPIRES_IN"],
    frontendUrl: process.env["FRONTEND_URL"],
    tokenEncryptionKey: process.env["TOKEN_ENCRYPTION_KEY"],
  });

  if (!result.success) {
    console.error("❌ Invalid configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
