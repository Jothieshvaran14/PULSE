import { prisma } from "../../lib/prisma.js";
import type { DeploymentStep, LogLevel } from "@prisma/client";

export const logsRepository = {
  async findByDeploymentId(
    deploymentId: string,
    options: {
      step?: DeploymentStep;
      level?: LogLevel;
      limit: number;
      offset: number;
    }
  ) {
    const where: Record<string, unknown> = {
      deploymentId,
    };

    if (options.step) where["step"] = options.step;
    if (options.level) where["level"] = options.level;

    const [logs, total] = await Promise.all([
      prisma.deploymentLog.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: options.offset,
        take: options.limit,
      }),
      prisma.deploymentLog.count({ where }),
    ]);

    return { logs, total };
  },
};
