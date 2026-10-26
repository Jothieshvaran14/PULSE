export type {
  DeploymentEngine,
  DeployConfig,
  DeployResult,
  HealthCheckConfig,
  ContainerInfo,
} from "./deployment-engine.js";
export { DockerDeploymentEngine } from "./docker-deployment-engine.js";
export { SwarmDeploymentEngine } from "./swarm-deployment-engine.js";
export { KubernetesDeploymentEngine } from "./kubernetes-deployment-engine.js";

import { DockerDeploymentEngine } from "./docker-deployment-engine.js";

/** Singleton Docker engine instance — the active deployment backend. */
export const dockerEngine = new DockerDeploymentEngine();
