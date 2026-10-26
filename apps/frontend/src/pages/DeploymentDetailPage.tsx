import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deploymentsApi } from "../api/deployments";
import StatusBadge from "../components/ui/StatusBadge";
import Button from "../components/ui/Button";
import LogViewer from "../components/logs/LogViewer";
import {
  ArrowLeft,
  ExternalLink,
  Square,
  Clock,
  GitCommitHorizontal,
  Container,
  Globe,
  Cpu,
  CheckCircle2,
  Circle,
  Loader2,
  Package,
  Terminal,
  ArrowDownToLine,
  XCircle,
  Copy,
  Check,
  RotateCw,
} from "lucide-react";

const ACTIVE_STATUSES = new Set(["QUEUED", "CLONING", "DETECTING", "INSTALLING", "BUILDING", "STARTING"]);

const PIPELINE_STEPS = [
  { key: "QUEUED", label: "Queued", icon: Circle },
  { key: "CLONING", label: "Cloning", icon: GitCommitHorizontal },
  { key: "DETECTING", label: "Detecting", icon: Cpu },
  { key: "INSTALLING", label: "Installing", icon: Package },
  { key: "BUILDING", label: "Building", icon: Container },
  { key: "STARTING", label: "Starting", icon: Loader2 },
  { key: "RUNNING", label: "Running", icon: CheckCircle2 },
];

function getStepIndex(status: string): number {
  return PIPELINE_STEPS.findIndex((s) => s.key === status);
}

export default function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  // Force re-render every second for live duration updates
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isPolling = (status?: string) => status ? ACTIVE_STATUSES.has(status) : true;

  const { data: deploymentData, isLoading } = useQuery({
    queryKey: ["deployment", id],
    queryFn: () => deploymentsApi.getById(id!),
    enabled: !!id,
    refetchInterval: (query) => isPolling(query.state.data?.data?.status) ? 2000 : false,
  });

  const { data: logsData } = useQuery({
    queryKey: ["deployment-logs", id],
    queryFn: () => deploymentsApi.getLogs(id!, { limit: 500 }),
    enabled: !!id,
    refetchInterval: () => {
      const s = deploymentData?.data?.status;
      return s && ACTIVE_STATUSES.has(s) ? 2000 : false;
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => deploymentsApi.stop(id!),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["deployment", id] }),
  });

  const redeployMutation = useMutation({
    mutationFn: () => {
      const projectId = deployment?.projectId;
      if (!projectId) {
        throw new Error("Cannot redeploy: deployment not loaded yet");
      }
      return deploymentsApi.triggerDeploy(projectId);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["deployments", deployment?.projectId] });
      navigate(`/deployments/${data.data.id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="animate-shimmer" style={{ height: "16px", width: "80px", marginBottom: "24px" }} />
        <div className="animate-shimmer" style={{ height: "32px", width: "300px", marginBottom: "32px" }} />
        <div className="animate-shimmer" style={{ height: "80px", marginBottom: "32px" }} />
        <div className="animate-shimmer" style={{ height: "200px" }} />
      </div>
    );
  }

  const deployment = deploymentData?.data;
  if (!deployment) {
    return <div className="page" style={{ textAlign: "center", color: "var(--color-text-muted)" }}>Deployment not found</div>;
  }

  const logs = logsData?.data ?? [];
  const isActive = ACTIVE_STATUSES.has(deployment.status);
  const currentStepIndex = getStepIndex(deployment.status);
  const isFailed = deployment.status === "FAILED";
  const isRunning = deployment.status === "RUNNING";

  return (
    <div className="page">
      {/* Back */}
      <Link
        to={`/projects/${deployment.projectId}`}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-muted)", textDecoration: "none", marginBottom: "24px" }}
      >
        <ArrowLeft style={{ width: "14px", height: "14px" }} />
        {deployment.project?.name ?? "Project"}
      </Link>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 className="text-page-title">
              Deploy <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>#{deployment.id.substring(0, 8)}</span>
            </h1>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="text-section-subtitle">
            {deployment.project?.name} · {deployment.framework ?? "Detecting framework..."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {isRunning && (
            <Button variant="danger" size="sm" onClick={() => stopMutation.mutate()} loading={stopMutation.isPending}>
              <Square style={{ width: "12px", height: "12px" }} />
              Stop
            </Button>
          )}
          {!isActive && (
            <Button variant="primary" size="sm" onClick={() => redeployMutation.mutate()} loading={redeployMutation.isPending}>
              <RotateCw style={{ width: "12px", height: "12px" }} />
              Redeploy
            </Button>
          )}
        </div>
      </div>

      {/* Live URL */}
      {deployment.url && isRunning && (
        <div className="section">
          <div className="card" style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-success)", animation: "pulse 2s ease-in-out infinite" }} />
            <span className="text-body">Live at</span>
            <a href={deployment.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--color-maroon-400)", display: "flex", alignItems: "center", gap: "6px", textDecoration: "none" }}>
              {deployment.url}
              <ExternalLink style={{ width: "12px", height: "12px" }} />
            </a>
          </div>
        </div>
      )}

      {/* Error */}
      {deployment.errorMessage && (
        <div className="section">
          <div className="card" style={{ padding: "16px 24px", background: "var(--color-error-dim)", borderColor: "rgba(239, 68, 68, 0.15)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <XCircle style={{ width: "16px", height: "16px", color: "#f87171", marginTop: "2px", flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#f87171" }}>{deployment.errorMessage}</p>
                {deployment.exitCode !== null && (
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#f87171", marginTop: "4px", opacity: 0.7 }}>
                    Exit code: {deployment.exitCode}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div className="section">
        <div className="card" style={{ padding: "24px" }}>
          <p className="text-label" style={{ marginBottom: "20px" }}>Pipeline</p>
          <div style={{ display: "flex", alignItems: "center" }}>
            {PIPELINE_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isComplete = index < currentStepIndex || (isRunning && index <= currentStepIndex);
              const isCurrent = step.key === deployment.status;
              const isStepFailed = isFailed && index === currentStepIndex;

              return (
                <div key={step.key} style={{ display: "flex", alignItems: "center", flex: index < PIPELINE_STEPS.length - 1 ? 1 : undefined }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: isStepFailed ? "var(--color-error-dim)" : isComplete ? "rgba(122, 31, 43, 0.15)" : "var(--color-bg-elevated)",
                      border: `1px solid ${isStepFailed ? "rgba(239, 68, 68, 0.2)" : isComplete ? "rgba(122, 31, 43, 0.25)" : "var(--color-border)"}`,
                    }}>
                      {isStepFailed ? <span style={{ color: "#f87171", fontSize: "12px" }}>✕</span>
                        : isComplete ? <CheckCircle2 style={{ width: "16px", height: "16px", color: "var(--color-maroon-400)" }} />
                        : isCurrent && isActive ? <Loader2 style={{ width: "16px", height: "16px", color: "var(--color-maroon-400)", animation: "spin 0.8s linear infinite" }} />
                        : <StepIcon style={{ width: "16px", height: "16px", color: "var(--color-text-faint)" }} />}
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 500, color: isCurrent ? "var(--color-maroon-400)" : isComplete ? "var(--color-text-secondary)" : "var(--color-text-faint)" }}>
                      {step.label}
                    </span>
                  </div>
                  {index < PIPELINE_STEPS.length - 1 && (
                    <div style={{ flex: 1, height: "1px", margin: "0 8px", marginBottom: "24px", background: index < currentStepIndex ? "rgba(122, 31, 43, 0.25)" : "var(--color-border)" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="section">
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="grid-info">
            <InfoCell
              icon={Clock}
              label="Status"
              value={deployment.status}
              color={
                deployment.status === "RUNNING" ? "var(--color-success)" :
                deployment.status === "FAILED" ? "#f87171" :
                isActive ? "var(--color-maroon-400)" :
                "var(--color-text-primary)"
              }
            />
            <InfoCell icon={Clock} label="Started" value={deployment.startedAt ? new Date(deployment.startedAt).toLocaleTimeString() : "—"} />
            <InfoCell icon={Clock} label="Completed" value={deployment.completedAt ? new Date(deployment.completedAt).toLocaleTimeString() : "—"} />
            <InfoCell
              icon={Clock}
              label="Total Duration"
              value={deployment.totalDuration != null
                ? formatDuration(deployment.totalDuration)
                : deployment.startedAt
                  ? formatDuration(now - new Date(deployment.startedAt).getTime())
                  : "—"}
            />
            <InfoCell icon={Package} label="Framework" value={deployment.framework ?? "—"} />
            <InfoCell icon={Terminal} label="Package Manager" value={deployment.packageManager ?? "—"} />
          </div>
          <div className="grid-info" style={{ borderTop: "1px solid var(--color-border)" }}>
            <InfoCell icon={GitCommitHorizontal} label="Commit" value={deployment.commitHash ? deployment.commitHash.substring(0, 7) : "—"} />
            <InfoCell icon={Container} label="Container" value={deployment.containerId ? deployment.containerId.substring(0, 12) : "—"} />
            <InfoCell icon={deployment.port ? Globe : Cpu} label="Port" value={deployment.port ? String(deployment.port) : "—"} />
            <InfoCell
              icon={Package}
              label="Install Duration"
              value={deployment.installDuration != null ? formatDuration(deployment.installDuration) : "—"}
            />
            <InfoCell
              icon={ArrowDownToLine}
              label="Build Duration"
              value={deployment.buildDuration != null ? formatDuration(deployment.buildDuration) : "—"}
            />
            <InfoCell
              icon={Terminal}
              label="Exit Code"
              value={deployment.exitCode != null ? String(deployment.exitCode) : "—"}
              color={deployment.exitCode === 0 ? "var(--color-success)" : deployment.exitCode != null ? "#f87171" : undefined}
            />
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="section">
        <div className="section-header">
          <h2 className="text-section-title">Build Logs</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="text-caption">{logs.length} entries</span>
            <button
              onClick={() => {
                const text = logs.map((l) => `[${l.level}] ${l.message}`).join("\n");
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {copied ? <Check style={{ width: "12px", height: "12px", color: "var(--color-success)" }} /> : <Copy style={{ width: "12px", height: "12px" }} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <LogViewer logs={logs} loading={isActive} />
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function InfoCell({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: "20px 24px", borderRight: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <Icon style={{ width: "12px", height: "12px", color: "var(--color-text-faint)" }} />
        <span className="text-label">{label}</span>
      </div>
      <p style={{
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
        color: color ?? "var(--color-text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>{value}</p>
    </div>
  );
}
