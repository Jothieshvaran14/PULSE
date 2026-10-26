import { projectsRepository } from "./projects.repository.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import type { CreateProjectSchema, UpdateProjectSchema } from "@ryme/shared";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { dockerService } from "../../services/docker.service.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";

export interface ImportProjectInput {
  githubId: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  ownerId: string;
}

export const projectsService = {
  async list(page: number, limit: number, ownerId: string) {
    const { projects, total } = await projectsRepository.findAll(page, limit, ownerId);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getById(id: string) {
    const project = await projectsRepository.findById(id);
    if (!project || project.status === "DELETED") {
      throw new NotFoundError("Project", id);
    }
    return project;
  },

  async create(data: CreateProjectSchema, ownerId: string) {
    const existing = await projectsRepository.findByName(data.name);
    if (existing && existing.status !== "DELETED") {
      throw new ConflictError(
        `A project with the name '${data.name}' already exists`
      );
    }

    return projectsRepository.create({
      name: data.name,
      repositoryUrl: data.repositoryUrl,
      githubToken: data.githubToken ? encrypt(data.githubToken) : undefined,
      defaultBranch: data.defaultBranch ?? "main",
      ownerId,
    });
  },

  async importFromGithub(input: ImportProjectInput) {
    const existingByGithubId = await projectsRepository.findByGithubId(input.githubId);
    if (existingByGithubId && existingByGithubId.status !== "DELETED") {
      throw new ConflictError(
        `Repository '${input.fullName}' is already imported`
      );
    }

    const existingByName = await projectsRepository.findByName(input.name);
    if (existingByName && existingByName.status !== "DELETED") {
      throw new ConflictError(
        `A project with the name '${input.name}' already exists`
      );
    }

    const repositoryUrl = `https://github.com/${input.fullName}`;

    return projectsRepository.importFromGithub({
      name: input.name,
      repositoryUrl,
      githubId: input.githubId,
      cloneUrl: input.cloneUrl,
      defaultBranch: input.defaultBranch,
      ownerId: input.ownerId,
    });
  },

  async update(id: string, data: UpdateProjectSchema) {
    const project = await projectsRepository.findById(id);
    if (!project || project.status === "DELETED") {
      throw new NotFoundError("Project", id);
    }

    if (data.name && data.name !== project.name) {
      const existing = await projectsRepository.findByName(data.name);
      if (existing && existing.status !== "DELETED") {
        throw new ConflictError(
          `A project with the name '${data.name}' already exists`
        );
      }
    }

    // Encrypt token if being updated
    const updateData = { ...data };
    if (updateData.githubToken) {
      updateData.githubToken = encrypt(updateData.githubToken);
    }

    return projectsRepository.update(id, updateData);
  },

  /**
   * Get the decrypted GitHub token for a project.
   * Used by the deployment orchestrator when cloning.
   */
  async getDecryptedToken(projectId: string): Promise<string | null> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { githubToken: true },
    });

    if (!project?.githubToken) {
      return null;
    }

    return decrypt(project.githubToken);
  },

  async delete(id: string) {
    const project = await projectsRepository.findById(id);
    if (!project || project.status === "DELETED") {
      throw new NotFoundError("Project", id);
    }

    const runningDeployments = await prisma.deployment.findMany({
      where: {
        projectId: id,
        status: "RUNNING",
      },
    });

    for (const deployment of runningDeployments) {
      try {
        if (deployment.containerId) {
          await dockerService.stopContainer(deployment.containerId);
          await dockerService.removeContainer(deployment.containerId);
        }
      } catch (error) {
        logger.warn(
          { error, deploymentId: deployment.id },
          "Error cleaning up deployment during project deletion"
        );
      }
    }

    return projectsRepository.softDelete(id);
  },
};
