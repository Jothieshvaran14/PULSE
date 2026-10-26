import { z } from "zod";

/**
 * GitHub URL validation pattern.
 * Only allows HTTPS GitHub URLs in the format: https://github.com/{owner}/{repo}
 * Optionally ending with .git
 *
 * Security: This prevents arbitrary URLs from being cloned, limiting the attack
 * surface to GitHub-only repositories.
 */
const GITHUB_URL_PATTERN =
  /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;

/**
 * Project name validation.
 * Used as Docker container name and subdomain, so must be DNS-safe.
 * Rules: 2-64 chars, lowercase alphanumeric + hyphens, must start with a letter.
 */
const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

/**
 * GitHub Personal Access Token patterns.
 * Classic tokens start with ghp_, fine-grained tokens start with github_pat_.
 */
const GITHUB_TOKEN_PATTERN = /^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82,})$/;

/**
 * Git branch name validation.
 * Prevents path traversal and injection via branch names.
 */
const BRANCH_NAME_PATTERN = /^[a-zA-Z0-9._\-/]+$/;

export const createProjectSchema = z.object({
  name: z
    .string()
    .min(2, "Project name must be at least 2 characters")
    .max(64, "Project name must be at most 64 characters")
    .regex(
      PROJECT_NAME_PATTERN,
      "Project name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens"
    ),
  repositoryUrl: z
    .string()
    .url("Must be a valid URL")
    .regex(
      GITHUB_URL_PATTERN,
      "Must be a valid GitHub repository URL (https://github.com/owner/repo)"
    ),
  githubToken: z
    .string()
    .regex(GITHUB_TOKEN_PATTERN, "Must be a valid GitHub Personal Access Token")
    .optional(),
  defaultBranch: z
    .string()
    .min(1)
    .max(255)
    .regex(BRANCH_NAME_PATTERN, "Invalid branch name")
    .default("main"),
});

export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(PROJECT_NAME_PATTERN)
    .optional(),
  repositoryUrl: z
    .string()
    .url()
    .regex(GITHUB_URL_PATTERN)
    .optional(),
  githubToken: z
    .string()
    .regex(GITHUB_TOKEN_PATTERN)
    .nullable()
    .optional(),
  defaultBranch: z
    .string()
    .min(1)
    .max(255)
    .regex(BRANCH_NAME_PATTERN)
    .optional(),
});

export type CreateProjectSchema = z.infer<typeof createProjectSchema>;
export type UpdateProjectSchema = z.infer<typeof updateProjectSchema>;

/**
 * Schema for importing a project from GitHub.
 * Validates all fields from the GitHub API response.
 */
export const importProjectSchema = z.object({
  githubId: z
    .number()
    .int()
    .positive("GitHub ID must be a positive integer"),
  name: z
    .string()
    .min(2, "Project name must be at least 2 characters")
    .max(64, "Project name must be at most 64 characters")
    .regex(
      PROJECT_NAME_PATTERN,
      "Project name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens"
    ),
  fullName: z
    .string()
    .min(3, "Full name is required")
    .max(255)
    .regex(
      /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/,
      "Full name must be in format owner/repo"
    ),
  cloneUrl: z
    .string()
    .url("Must be a valid URL")
    .regex(
      GITHUB_URL_PATTERN,
      "Must be a valid GitHub repository URL (https://github.com/owner/repo)"
    ),
  defaultBranch: z
    .string()
    .min(1)
    .max(255)
    .regex(BRANCH_NAME_PATTERN, "Invalid branch name")
    .default("main"),
  private: z.boolean().default(false),
});

export type ImportProjectSchema = z.infer<typeof importProjectSchema>;
