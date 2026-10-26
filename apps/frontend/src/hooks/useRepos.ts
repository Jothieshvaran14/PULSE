import { useState, useEffect, useCallback } from "react";
import { githubApi, type GitHubRepo } from "../api/github";

interface UseReposResult {
  repos: GitHubRepo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRepos(params?: {
  type?: "all" | "owner" | "public" | "private" | "member";
  sort?: "created" | "updated" | "pushed" | "full_name";
  direction?: "asc" | "desc";
  perPage?: number;
}): UseReposResult {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await githubApi.getRepos(params);
      setRepos(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch repositories";
      setError(message);
      console.error("Failed to fetch repos:", err);
    } finally {
      setIsLoading(false);
    }
  }, [params?.type, params?.sort, params?.direction, params?.perPage]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return { repos, isLoading, error, refetch: fetchRepos };
}
