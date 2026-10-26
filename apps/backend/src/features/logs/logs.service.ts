import { logsRepository } from "./logs.repository.js";
import type { DeploymentStep, LogLevel } from "@prisma/client";

export const logsService = {
  async getByDeploymentId(
    deploymentId: string,
    options: {
      step?: DeploymentStep;
      level?: LogLevel;
      limit: number;
      offset: number;
    }
  ) {
    const { logs, total } = await logsRepository.findByDeploymentId(
      deploymentId,
      options
    );

    return {
      logs,
      pagination: {
        total,
        limit: options.limit,
        offset: options.offset,
      },
    };
  },
};
