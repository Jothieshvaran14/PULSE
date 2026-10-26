import { z } from "zod";

export const deploymentLogQuerySchema = z.object({
  step: z
    .enum([
      "CLONE",
      "DETECT",
      "INSTALL",
      "GENERATE_DOCKERFILE",
      "BUILD",
      "START",
      "ROUTE",
      "COMPLETE",
      "ERROR",
    ])
    .optional(),
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DeploymentLogQuerySchema = z.infer<typeof deploymentLogQuerySchema>;
export type PaginationQuerySchema = z.infer<typeof paginationQuerySchema>;
