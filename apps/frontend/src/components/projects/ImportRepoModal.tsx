import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { githubApi, type GitHubRepo } from "../../api/github";
import { projectsApi } from "../../api/projects";
import { X, Search, GitBranch, Lock, Unlock, Loader2 } from "lucide-react";
import Button from "../ui/Button";

interface ImportRepoModalProps {
  onClose: () => void;
}

export default function ImportRepoModal({ onClose }: ImportRepoModalProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [projectName, setProjectName] = useState("");

  const { data: repos, isLoading } = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => githubApi.getRepos({ perPage: 100, sort: "updated" }),
  });

  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    if (!search) return repos;
    const q = search.toLowerCase();
    return repos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(q) ||
        repo.fullName.toLowerCase().includes(q) ||
        repo.language?.toLowerCase().includes(q)
    );
  }, [repos, search]);

  const importMutation = useMutation({
    mutationFn: (data: { githubId: number; name: string; fullName: string; cloneUrl: string; defaultBranch: string; private: boolean }) =>
      projectsApi.importFromGithub(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setProjectName(repo.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  };

  const handleImport = () => {
    if (!selectedRepo || !projectName) return;
    importMutation.mutate({
      githubId: selectedRepo.id,
      name: projectName,
      fullName: selectedRepo.fullName,
      cloneUrl: selectedRepo.cloneUrl,
      defaultBranch: selectedRepo.defaultBranch,
      private: selectedRepo.private,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="text-section-title">Import Repository</h2>
          <button onClick={onClose} style={{ padding: "6px", color: "var(--color-text-faint)", background: "none", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "16px", height: "16px", color: "var(--color-text-faint)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..."
              className="input"
              style={{ paddingLeft: "40px" }}
            />
          </div>
        </div>

        {/* Repo List */}
        <div className="modal-body">
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
              <Loader2 style={{ width: "20px", height: "20px", color: "var(--color-maroon-400)", animation: "spin 0.8s linear infinite" }} />
              <span className="text-body" style={{ marginLeft: "8px" }}>Loading repositories...</span>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <p className="text-body" style={{ color: "var(--color-text-muted)" }}>No repositories found</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {filteredRepos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => handleSelectRepo(repo)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: selectedRepo?.id === repo.id ? "rgba(122, 31, 43, 0.12)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { if (selectedRepo?.id !== repo.id) e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { if (selectedRepo?.id !== repo.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{repo.name}</span>
                        {repo.private ? <Lock style={{ width: "12px", height: "12px", color: "var(--color-warning)" }} /> : <Unlock style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />}
                      </div>
                      <p className="text-caption" style={{ marginBottom: "4px" }}>{repo.fullName}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {repo.language && <span className="text-caption">{repo.language}</span>}
                        <span className="text-caption" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <GitBranch style={{ width: "12px", height: "12px" }} />
                          {repo.defaultBranch}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedRepo && (
          <div className="modal-footer">
            <div style={{ flex: 1, marginRight: "16px" }}>
              <label className="text-label" style={{ display: "block", marginBottom: "6px" }}>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="input"
              />
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleImport} loading={importMutation.isPending} disabled={!projectName}>
                Import Repository
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
