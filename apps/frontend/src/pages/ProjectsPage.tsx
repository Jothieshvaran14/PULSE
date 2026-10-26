import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { projectsApi } from "../api/projects";
import StatusBadge from "../components/ui/StatusBadge";
import Button from "../components/ui/Button";
import CreateProjectForm from "../components/projects/CreateProjectForm";
import ImportRepoModal from "../components/projects/ImportRepoModal";
import {
  Plus,
  FolderGit2,
  ExternalLink,
  GitBranch,
  Download,
  Search,
} from "lucide-react";

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [page] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", page],
    queryFn: () => projectsApi.list(page, 20),
  });

  const allProjects = data?.data ?? [];
  const projects = search
    ? allProjects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : allProjects;

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="text-page-title">Projects</h1>
          <p className="text-section-subtitle">Manage your deployed applications</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
            <Download style={{ width: "14px", height: "14px" }} />
            Import
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus style={{ width: "14px", height: "14px" }} />
            New Project
          </Button>
        </div>
      </div>

      {/* Search */}
      {allProjects.length > 0 && (
        <div className="section" style={{ marginBottom: "24px" }}>
          <div style={{ position: "relative", maxWidth: "400px" }}>
            <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "16px", height: "16px", color: "var(--color-text-faint)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Projects"
              className="input"
              style={{ paddingLeft: "40px" }}
            />
          </div>
        </div>
      )}

      {/* Projects Grid */}
      <div className="section">
        {isLoading ? (
          <div className="grid-cards">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-shimmer" style={{ height: "200px" }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="card" style={{ padding: "80px 24px", textAlign: "center" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "var(--radius-lg)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <FolderGit2 style={{ width: "24px", height: "24px", color: "var(--color-text-faint)" }} />
            </div>
            <h3 className="text-section-title" style={{ marginBottom: "8px" }}>
              {search ? "No projects match your search" : "No projects yet"}
            </h3>
            <p className="text-body" style={{ maxWidth: "400px", margin: "0 auto 24px" }}>
              {search
                ? "Try a different search term."
                : "Import a GitHub repository or create a new project to deploy."}
            </p>
            {!search && (
              <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
                <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                  <Download style={{ width: "14px", height: "14px" }} />
                  Import Repository
                </Button>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus style={{ width: "14px", height: "14px" }} />
                  Create Project
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid-cards">
            {projects.map((project, index) => {
              const latestDeployment = project.deployments?.[0];
              return (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="card-interactive"
                  style={{ padding: "24px", textDecoration: "none", animationDelay: `${index * 30}ms` }}
                >
                  {/* Top */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "var(--radius-md)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FolderGit2 style={{ width: "18px", height: "18px", color: "var(--color-text-faint)" }} />
                    </div>
                    <StatusBadge
                      status={latestDeployment?.status ?? project.status}
                      size="sm"
                    />
                  </div>

                  {/* Name */}
                  <h3 style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>
                    {project.name}
                  </h3>

                  {/* Meta */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                    <span className="text-caption" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <GitBranch style={{ width: "12px", height: "12px" }} />
                      {project.defaultBranch}
                    </span>
                    {project.framework && (
                      <>
                        <span style={{ color: "var(--color-text-faint)" }}>·</span>
                        <span className="text-caption">{project.framework.displayName}</span>
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "16px", borderTop: "1px solid var(--color-border)" }}>
                    <span className="text-caption">
                      {project._count?.deployments ?? 0} deployment{project._count?.deployments !== 1 ? "s" : ""}
                    </span>
                    {latestDeployment?.url && latestDeployment.status === "RUNNING" && (
                      <span className="text-caption" style={{ color: "var(--color-success)", display: "flex", alignItems: "center", gap: "4px" }}>
                        <ExternalLink style={{ width: "12px", height: "12px" }} />
                        Live
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && <CreateProjectForm onClose={() => setShowCreate(false)} />}
      {showImport && <ImportRepoModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
