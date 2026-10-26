import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { deploymentsApi } from "../api/deployments";
import StatusBadge from "../components/ui/StatusBadge";
import Button from "../components/ui/Button";
import {
  ArrowLeft,
  Rocket,
  ExternalLink,
  GitBranch,
  Clock,
  Trash2,
  Globe,
  GitCommitHorizontal,
  FolderGit2,
  Package,
  Terminal,
  Play,
  Settings,
  ArrowDownToLine,
  Gauge,
  Shield,
} from "lucide-react";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projectData, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.getById(id!),
    enabled: !!id,
  });

  const { data: deploymentsData } = useQuery({
    queryKey: ["deployments", id],
    queryFn: () => deploymentsApi.listByProject(id!, 1, 10),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const { data: frameworkData } = useQuery({
    queryKey: ["framework", id],
    queryFn: () => projectsApi.getFramework(id!),
    enabled: !!id,
  });

  const deployMutation = useMutation({
    mutationFn: () => deploymentsApi.triggerDeploy(id!),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["deployments", id] });
      navigate(`/deployments/${data.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/projects");
    },
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="animate-shimmer" style={{ height: "16px", width: "80px", marginBottom: "24px" }} />
        <div className="animate-shimmer" style={{ height: "32px", width: "200px", marginBottom: "32px" }} />
        <div className="animate-shimmer" style={{ height: "120px", marginBottom: "32px" }} />
        <div className="animate-shimmer" style={{ height: "300px" }} />
      </div>
    );
  }

  const project = projectData?.data;
  if (!project) {
    return (
      <div className="page" style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
        Project not found
      </div>
    );
  }

  const deployments = deploymentsData?.data ?? [];
  const latestRunning = deployments.find((d) => d.status === "RUNNING");

  return (
    <div className="page">
      {/* Back */}
      <Link
        to="/projects"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-muted)", textDecoration: "none", marginBottom: "24px" }}
      >
        <ArrowLeft style={{ width: "14px", height: "14px" }} />
        Projects
      </Link>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ flexDirection: "row", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FolderGit2 style={{ width: "20px", height: "20px", color: "var(--color-text-faint)" }} />
          </div>
          <div>
            <h1 className="text-page-title">{project.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
              <span className="text-caption" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <GitBranch style={{ width: "12px", height: "12px" }} />
                {project.defaultBranch}
              </span>
              {project.framework && (
                <span style={{ fontSize: "11px", color: "var(--color-maroon-400)", background: "rgba(122, 31, 43, 0.15)", padding: "2px 8px", borderRadius: "999px", fontWeight: 500 }}>
                  {project.framework.displayName}
                </span>
              )}
              <StatusBadge status={project.status} size="sm" />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm("Delete this project and stop all deployments?")) {
                deleteMutation.mutate();
              }
            }}
            loading={deleteMutation.isPending}
          >
            <Trash2 style={{ width: "14px", height: "14px" }} />
            Delete
          </Button>
          <Button
            size="sm"
            onClick={() => deployMutation.mutate()}
            loading={deployMutation.isPending}
          >
            <Rocket style={{ width: "14px", height: "14px" }} />
            Deploy
          </Button>
        </div>
      </div>

      {/* Live URL */}
      {latestRunning?.url && (
        <div className="section">
          <div className="card" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-success)", animation: "pulse 2s ease-in-out infinite" }} />
              <span className="text-body">Application is live at</span>
              <a
                href={latestRunning.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--color-maroon-400)", display: "flex", alignItems: "center", gap: "6px", textDecoration: "none" }}
              >
                {latestRunning.url}
                <ExternalLink style={{ width: "12px", height: "12px" }} />
              </a>
            </div>
            <Globe style={{ width: "16px", height: "16px", color: "var(--color-text-faint)" }} />
          </div>
        </div>
      )}

      {/* Repository */}
      <div className="section">
        <div className="card" style={{ padding: "20px 24px" }}>
          <p className="text-label" style={{ marginBottom: "8px" }}>Repository</p>
          <a
            href={project.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--color-maroon-400)", display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}
          >
            {project.repositoryUrl}
            <ExternalLink style={{ width: "12px", height: "12px" }} />
          </a>
        </div>
      </div>

      {/* Framework Detection */}
      {frameworkData?.data && frameworkData.data.framework && (
        <div className="section">
          <div className="section-header">
            <h2 className="text-section-title">Framework</h2>
            <span className="text-caption">Auto-detected</span>
          </div>

          <div className="card" style={{ padding: "24px" }}>
            {/* Framework name and confidence */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "var(--radius-md)", background: "rgba(122, 31, 43, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Package style={{ width: "18px", height: "18px", color: "var(--color-maroon-400)" }} />
                </div>
                <div>
                  <p className="text-body" style={{ fontWeight: 600, color: "var(--color-text)" }}>{frameworkData.data.displayName}</p>
                  {frameworkData.data.frameworkVersion && (
                    <p className="text-caption">v{frameworkData.data.frameworkVersion}</p>
                  )}
                </div>
              </div>
              {frameworkData.data.confidence !== null && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "var(--radius-full)", background: frameworkData.data.confidence >= 0.9 ? "rgba(34, 197, 94, 0.15)" : frameworkData.data.confidence >= 0.7 ? "rgba(234, 179, 8, 0.15)" : "rgba(239, 68, 68, 0.15)" }}>
                  <Shield style={{ width: "12px", height: "12px", color: frameworkData.data.confidence >= 0.9 ? "#22c55e" : frameworkData.data.confidence >= 0.7 ? "#eab308" : "#ef4444" }} />
                  <span className="text-caption" style={{ fontWeight: 500, color: frameworkData.data.confidence >= 0.9 ? "#22c55e" : frameworkData.data.confidence >= 0.7 ? "#eab308" : "#ef4444" }}>
                    {Math.round(frameworkData.data.confidence * 100)}% confidence
                  </span>
                </div>
              )}
            </div>

            {/* Details grid */}
            <div className="grid-info" style={{ gap: "1px", background: "var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              {frameworkData.data.packageManager && (
                <div style={{ padding: "14px 16px", background: "var(--color-bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Terminal style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />
                    <p className="text-label">Package Manager</p>
                  </div>
                  <p className="text-body" style={{ fontFamily: "var(--font-mono)" }}>{frameworkData.data.packageManager}</p>
                </div>
              )}

              {frameworkData.data.buildCommand && (
                <div style={{ padding: "14px 16px", background: "var(--color-bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Settings style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />
                    <p className="text-label">Build Command</p>
                  </div>
                  <p className="text-body" style={{ fontFamily: "var(--font-mono)" }}>{frameworkData.data.buildCommand}</p>
                </div>
              )}

              {frameworkData.data.startCommand && (
                <div style={{ padding: "14px 16px", background: "var(--color-bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Play style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />
                    <p className="text-label">Start Command</p>
                  </div>
                  <p className="text-body" style={{ fontFamily: "var(--font-mono)" }}>{frameworkData.data.startCommand}</p>
                </div>
              )}

              {frameworkData.data.outputDirectory && (
                <div style={{ padding: "14px 16px", background: "var(--color-bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <ArrowDownToLine style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />
                    <p className="text-label">Output Directory</p>
                  </div>
                  <p className="text-body" style={{ fontFamily: "var(--font-mono)" }}>{frameworkData.data.outputDirectory}</p>
                </div>
              )}

              {frameworkData.data.installCommand && (
                <div style={{ padding: "14px 16px", background: "var(--color-bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Package style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />
                    <p className="text-label">Install Command</p>
                  </div>
                  <p className="text-body" style={{ fontFamily: "var(--font-mono)" }}>{frameworkData.data.installCommand}</p>
                </div>
              )}

              {frameworkData.data.devCommand && (
                <div style={{ padding: "14px 16px", background: "var(--color-bg-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Gauge style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />
                    <p className="text-label">Dev Command</p>
                  </div>
                  <p className="text-body" style={{ fontFamily: "var(--font-mono)" }}>{frameworkData.data.devCommand}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deployments */}
      <div className="section">
        <div className="section-header">
          <h2 className="text-section-title">Deployments</h2>
          <span className="text-caption">{deployments.length} total</span>
        </div>

        {deployments.length === 0 ? (
          <div className="card" style={{ padding: "64px 24px", textAlign: "center" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Rocket style={{ width: "20px", height: "20px", color: "var(--color-text-faint)" }} />
            </div>
            <p className="text-section-title" style={{ marginBottom: "4px" }}>No deployments yet</p>
            <p className="text-caption">Click Deploy to build and run your application.</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            {deployments.map((deployment, index) => (
              <Link
                key={deployment.id}
                to={`/deployments/${deployment.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 24px",
                  textDecoration: "none",
                  borderBottom: index < deployments.length - 1 ? "1px solid var(--color-border)" : "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-sm)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <GitCommitHorizontal style={{ width: "14px", height: "14px", color: "var(--color-text-faint)" }} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--color-text-muted)" }}>
                        #{deployment.id.substring(0, 8)}
                      </span>
                      <StatusBadge status={deployment.status} size="sm" />
                    </div>
                    {deployment.framework && (
                      <p className="text-caption" style={{ marginTop: "2px" }}>{deployment.framework}</p>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <span className="text-caption" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock style={{ width: "12px", height: "12px" }} />
                    {new Date(deployment.createdAt).toLocaleString()}
                  </span>
                  {deployment.url && deployment.status === "RUNNING" && (
                    <a
                      href={deployment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: "var(--color-text-faint)" }}
                    >
                      <ExternalLink style={{ width: "14px", height: "14px" }} />
                    </a>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
