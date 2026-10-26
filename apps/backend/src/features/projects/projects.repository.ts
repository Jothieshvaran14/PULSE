import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export const projectsRepository = {
  async findAll(page: number, limit: number, ownerId: string) {
    const skip = (page - 1) * limit;

    // D13 (PULSE-10): list reads are scoped to the authenticated principal.
    // `ownerId: ownerId` also excludes quarantined orphans (owner_id IS NULL)
    // — a missing owner is never treated as public visibility.
    const ownerFilter = { status: { not: "DELETED" as const }, ownerId };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: ownerFilter,
        include: {
          framework: { select: { name: true, displayName: true } },
          _count: { select: { deployments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.project.count({
        where: ownerFilter,
      }),
    ]);

    return { projects, total };
  },

  async findById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        framework: { select: { name: true, displayName: true } },
        deployments: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            framework: true,
            url: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });
  },

  async findByName(name: string) {
    return prisma.project.findUnique({
      where: { name },
    });
  },

  async findByGithubId(githubId: number) {
    return prisma.project.findUnique({
      where: { githubId },
    });
  },

  async create(data: {
    name: string;
    repositoryUrl: string;
    githubToken?: string;
    defaultBranch: string;
    ownerId: string;
  }) {
    return prisma.project.create({
      data: {
        name: data.name,
        repositoryUrl: data.repositoryUrl,
        githubToken: data.githubToken,
        defaultBranch: data.defaultBranch,
        ownerId: data.ownerId,
      },
      include: {
        framework: { select: { name: true, displayName: true } },
      },
    });
  },

  async importFromGithub(data: {
    name: string;
    repositoryUrl: string;
    githubId: number;
    cloneUrl: string;
    defaultBranch: string;
    ownerId: string;
  }) {
    return prisma.project.create({
      data: {
        name: data.name,
        repositoryUrl: data.repositoryUrl,
        githubId: data.githubId,
        cloneUrl: data.cloneUrl,
        defaultBranch: data.defaultBranch,
        ownerId: data.ownerId,
      },
      include: {
        framework: { select: { name: true, displayName: true } },
      },
    });
  },

  async update(id: string, data: Prisma.ProjectUpdateInput) {
    return prisma.project.update({
      where: { id },
      data,
      include: {
        framework: { select: { name: true, displayName: true } },
      },
    });
  },

  async softDelete(id: string) {
    return prisma.project.update({
      where: { id },
      data: { status: "DELETED" },
    });
  },
};
