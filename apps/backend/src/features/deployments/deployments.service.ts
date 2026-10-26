import { deploymentsRepository } from "./deployments.repository.js";
import { deploymentOrchestrator } from "../../services/deployment-orchestrator.js";
import { NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

export const deploymentsService = {
  async getById(id: string) {
    const deployment = await deploymentsRepository.findById(id);
    if (!deployment) {
      throw new NotFoundError("Deployment", id);
    }
    return deployment;
  },

  async listByProject(projectId: string, page: number, limit: number) {
    const { deployments, total } = await deploymentsRepository.findByProjectId(
      projectId,
      page,
      limit
    );

    return {
      deployments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getLogs(deploymentId: string, filters: { step?: string; level?: string; limit?: number; offset?: number }) {
    return deploymentsRepository.findLogs(deploymentId, filters);
  },

  async triggerDeploy(projectId: string) {
    // Create deployment record
    const deployment = await deploymentsRepository.create(projectId);

    logger.info(
      { deploymentId: deployment.id, projectId },
      "Deployment triggered"
    );

    // Start the deployment pipeline asynchronously
    // The orchestrator handles its own error reporting
    void deploymentOrchestrator.deploy(deployment.id);

    return deployment;
  },

  async stopDeployment(deploymentId: string) {
    const deployment = await deploymentsRepository.findById(deploymentId);
    if (!deployment) {
      throw new NotFoundError("Deployment", deploymentId);
    }

    await deploymentOrchestrator.stop(deploymentId);
    return deploymentsRepository.findById(deploymentId);
  },
};
