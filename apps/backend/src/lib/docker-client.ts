import Docker from "dockerode";
import { config } from "../config/index.js";

/**
 * Dockerode client singleton.
 *
 * Connects to the Docker Engine via the Unix socket.
 * All Docker operations (build, run, stop, remove) go through this client
 * instead of shell commands, preventing command injection.
 */
export const docker = new Docker({
  socketPath: config.dockerSocketPath,
});
