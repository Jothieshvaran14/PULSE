import { api } from "./client";

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  description: string | null;
  fork: boolean;
  language: string | null;
  defaultBranch: string;
  owner: {
    login: string;
    id: number;
    avatarUrl: string;
  };
  updatedAt: string;
}

export const githubApi = {
  /**
   * Get all repositories accessible with the authenticated user's GitHub token.
   */
  async getRepos(params?: {
    type?: "all" | "owner" | "public" | "private" | "member";
    sort?: "created" | "updated" | "pushed" | "full_name";
    direction?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }): Promise<GitHubRepo[]> {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.set("type", params.type);
    if (params?.sort) queryParams.set("sort", params.sort);
    if (params?.direction) queryParams.set("direction", params.direction);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.perPage) queryParams.set("per_page", String(params.perPage));

    const queryString = queryParams.toString();
    const url = `/github/repos${queryString ? `?${queryString}` : ""}`;

    const response = await api.get<{ data: GitHubRepo[] }>(url);
    return response.data.data;
  },
};
