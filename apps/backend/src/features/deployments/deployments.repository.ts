import { prisma } from "../../lib/prisma.js";

export const deploymentsRepository = {
  async findById(id: string) {
    return prisma.deployment.findUnique({
      where: { id },
      include: {
        project: { select: { name: true, repositoryUrl: true } },
      },
    });
  },

  async findByProjectId(projectId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [deployments, total] = await Promise.all([
      prisma.deployment.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          project: { select: { name: true, repositoryUrl: true } },
        },
      }),
      prisma.deployment.count({ where: { projectId } }),
    ]);

    return { deployments, total };
  },

  async findLogs(deploymentId: string, filters: { step?: string; level?: string; limit?: number; offset?: number }) {
    const where: Record<string, unknown> = { deploymentId };
    if (filters.step) where.step = filters.step;
    if (filters.level) where.level = filters.level;

    return prisma.deploymentLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: filters.offset ?? 0,
      take: filters.limit ?? 500,
    });
  },

  async create(projectId: string) {
    return prisma.deployment.create({
      data: {
        projectId,
        status: "QUEUED",
      },
      include: {
        project: { select: { name: true, repositoryUrl: true } },
      },
    });
  },
};
