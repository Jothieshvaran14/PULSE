import type { Request, Response, NextFunction } from "express";
import { authService } from "../auth/auth.service.js";
import { logger } from "../../lib/logger.js";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  description: string | null;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  language: string | null;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
  };
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export const githubController = {
  /**
   * GET /github/repos
   *
   * Returns all repositories accessible with the authenticated user's GitHub token.
   * Requires valid JWT in Authorization header.
   *
   * Queries:
   *   - type (optional): all, owner, public, private, member (default: all)
   *   - sort (optional): created, updated, pushed, full_name (default: updated)
   *   - direction (optional): asc, desc (default: desc)
   *   - page (optional): page number (default: 1)
   *   - per_page (optional): results per page (default: 30, max: 100)
   */
  async getRepos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const accessToken = await authService.getDecryptedToken(userId);

      const {
        type = "all",
        sort = "updated",
        direction = "desc",
        page = "1",
        per_page = "30",
      } = req.query as Record<string, string>;

      const params = new URLSearchParams({
        type,
        sort,
        direction,
        page: String(Math.min(Math.max(parseInt(page) || 1, 1), 100)),
        per_page: String(Math.min(Math.max(parseInt(per_page) || 30, 1), 100)),
      });

      const response = await fetch(`https://api.github.com/user/repos?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "RYME-Platform",
        },
      });

      if (!response.ok) {
        logger.error({ status: response.status }, "Failed to fetch GitHub repos");
        res.status(502).json({
          success: false,
          error: {
            code: "GITHUB_REPOS_FETCH_FAILED",
            message: "Failed to fetch repositories from GitHub",
            statusCode: 502,
          },
        });
        return;
      }

      const repos = (await response.json()) as GitHubRepo[];

      const sanitizedRepos = repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        description: repo.description,
        fork: repo.fork,
        language: repo.language,
        defaultBranch: repo.default_branch,
        owner: {
          login: repo.owner.login,
          id: repo.owner.id,
          avatarUrl: repo.owner.avatar_url,
        },
        updatedAt: repo.updated_at,
      }));

      res.json({
        success: true,
        data: sanitizedRepos,
        meta: {
          timestamp: new Date().toISOString(),
          count: sanitizedRepos.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
