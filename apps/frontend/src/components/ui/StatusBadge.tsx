const STATUS_CONFIG: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  QUEUED: { color: "var(--color-text-muted)", bg: "var(--color-bg-elevated)", dot: "var(--color-text-muted)", label: "Queued" },
  CLONING: { color: "#60a5fa", bg: "rgba(96, 165, 250, 0.1)", dot: "#60a5fa", label: "Cloning" },
  DETECTING: { color: "#a78bfa", bg: "rgba(167, 139, 250, 0.1)", dot: "#a78bfa", label: "Detecting" },
  INSTALLING: { color: "#f472b6", bg: "rgba(244, 114, 182, 0.1)", dot: "#f472b6", label: "Installing" },
  BUILDING: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)", dot: "#fbbf24", label: "Building" },
  STARTING: { color: "#22d3ee", bg: "rgba(34, 211, 238, 0.1)", dot: "#22d3ee", label: "Starting" },
  RUNNING: { color: "#4ade80", bg: "rgba(74, 222, 128, 0.1)", dot: "#4ade80", label: "Running" },
  FAILED: { color: "#f87171", bg: "rgba(248, 113, 113, 0.1)", dot: "#f87171", label: "Failed" },
  STOPPED: { color: "var(--color-text-muted)", bg: "var(--color-bg-elevated)", dot: "var(--color-text-muted)", label: "Stopped" },
  ACTIVE: { color: "#4ade80", bg: "rgba(74, 222, 128, 0.1)", dot: "#4ade80", label: "Active" },
  INACTIVE: { color: "var(--color-text-muted)", bg: "var(--color-bg-elevated)", dot: "var(--color-text-muted)", label: "Inactive" },
};

const ACTIVE_STATUSES = new Set(["CLONING", "DETECTING", "INSTALLING", "BUILDING", "STARTING", "QUEUED"]);

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    color: "var(--color-text-muted)",
    bg: "var(--color-bg-elevated)",
    dot: "var(--color-text-muted)",
    label: status,
  };

  const isActive = ACTIVE_STATUSES.has(status);

  return (
    <span
      className="badge"
      style={{
        background: config.bg,
        color: config.color,
        padding: size === "sm" ? "1px 8px" : "2px 10px",
      }}
    >
      <span
        className="badge-dot"
        style={{
          background: config.dot,
          animation: isActive || status === "RUNNING" || status === "ACTIVE" ? "pulse 2s ease-in-out infinite" : "none",
          opacity: isActive ? 1 : 0.5,
        }}
      />
      {config.label}
    </span>
  );
}
