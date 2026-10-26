import { useQuery } from "@tanstack/react-query";
import { healthApi } from "../api/health";
import { projectsApi } from "../api/projects";
import { Link } from "react-router-dom";
import StatusBadge from "../components/ui/StatusBadge";
import Button from "../components/ui/Button";
import {
  Rocket,
  FolderGit2,
  Container,
  Activity,
  ArrowRight,
  ExternalLink,
  GitBranch,
  Plus,
} from "lucide-react";

export default function DashboardPage() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => healthApi.check(),
    refetchInterval: 15000,
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects", 1],
    queryFn: () => projectsApi.list(1, 5),
  });

  const projects = projectsData?.data ?? [];
  const healthData = health?.data;

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="text-page-title">Dashboard</h1>
          <p className="text-section-subtitle">Overview of your deployment platform</p>
        </div>
      </div>

      {/* Stats */}
      <div className="section">
        <div className="grid-stats">
          <StatCard
            icon={FolderGit2}
            label="Projects"
            value={String(projectsData?.meta?.pagination?.total ?? 0)}
            accent="maroon"
          />
          <StatCard
            icon={Container}
            label="Docker"
            value={healthData?.docker ? "Online" : "Offline"}
            accent={healthData?.docker ? "green" : "red"}
          />
          <StatCard
            icon={Activity}
            label="Database"
            value={healthData?.database ? "Online" : "Offline"}
            accent={healthData?.database ? "green" : "red"}
          />
          <StatCard
            icon={Rocket}
            label="System"
            value={healthData?.status === "healthy" ? "Healthy" : "Degraded"}
            accent={healthData?.status === "healthy" ? "green" : "amber"}
          />
        </div>
      </div>

      {/* Recent Projects */}
      <div className="section">
        <div className="section-header">
          <div>
            <h2 className="text-section-title">Recent Projects</h2>
            <p className="text-caption" style={{ marginTop: "2px" }}>
              {projects.length} project{projects.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <Link to="/projects" style={{ textDecoration: "none" }}>
            <Button variant="ghost" size="sm">
              View all
              <ArrowRight style={{ width: "14px", height: "14px" }} />
            </Button>
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="card" style={{ padding: "64px 24px", textAlign: "center" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <FolderGit2 style={{ width: "20px", height: "20px", color: "var(--color-text-faint)" }} />
            </div>
            <p className="text-section-title" style={{ marginBottom: "4px" }}>No projects yet</p>
            <p className="text-caption" style={{ marginBottom: "20px" }}>Import a repository to get started.</p>
            <Link to="/projects" style={{ textDecoration: "none" }}>
              <Button size="sm">
                <Plus style={{ width: "14px", height: "14px" }} />
                Create your first project
              </Button>
            </Link>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {projects.map((project, index) => {
                const latestDeployment = project.deployments?.[0];
                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 24px",
                      textDecoration: "none",
                      borderBottom: index < projects.length - 1 ? "1px solid var(--color-border)" : "none",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "var(--radius-md)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FolderGit2 style={{ width: "16px", height: "16px", color: "var(--color-text-faint)" }} />
                      </div>
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                          {project.name}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
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
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      {latestDeployment?.url && latestDeployment.status === "RUNNING" && (
                        <a
                          href={latestDeployment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--color-text-faint)" }}
                        >
                          <ExternalLink style={{ width: "14px", height: "14px" }} />
                        </a>
                      )}
                      <StatusBadge
                        status={latestDeployment?.status ?? project.status}
                        size="sm"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: "maroon" | "green" | "red" | "amber";
}) {
  const accentColors = {
    maroon: { icon: "var(--color-maroon-400)", bg: "rgba(122, 31, 43, 0.15)" },
    green: { icon: "var(--color-success)", bg: "var(--color-success-dim)" },
    red: { icon: "var(--color-error)", bg: "var(--color-error-dim)" },
    amber: { icon: "var(--color-warning)", bg: "var(--color-warning-dim)" },
  };

  const colors = accentColors[accent];

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "var(--radius-md)", background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon style={{ width: "18px", height: "18px", color: colors.icon }} />
        </div>
        <div>
          <p className="text-label">{label}</p>
          <p style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-text-primary)", textTransform: "capitalize" }}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
