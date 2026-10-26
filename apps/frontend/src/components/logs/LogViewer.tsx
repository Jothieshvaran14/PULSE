import { useRef, useEffect } from "react";
import type { DeploymentLog } from "../../api/deployments";

interface LogViewerProps {
  logs: DeploymentLog[];
  loading?: boolean;
}

const LEVEL_CLASSES: Record<string, string> = {
  INFO: "log-line-info",
  WARN: "log-line-warn",
  ERROR: "log-line-error",
  DEBUG: "log-line-debug",
};

const STEP_PREFIX: Record<string, string> = {
  CLONE: "$ git clone",
  DETECT: "→ detect",
  GENERATE_DOCKERFILE: "→ generate",
  BUILD: "$ docker build",
  START: "$ docker run",
  ROUTE: "→ route",
  COMPLETE: "✓ complete",
  ERROR: "✗ error",
};

export default function LogViewer({ logs, loading }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  if (loading && logs.length === 0) {
    return (
      <div style={{ borderRadius: "var(--radius-lg)", background: "#0D0808", border: "1px solid var(--color-border)", padding: "32px", textAlign: "center" }}>
        <p style={{ color: "var(--color-text-faint)", fontSize: "13px" }}>Waiting for logs...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="log-viewer"
      style={{ borderRadius: "var(--radius-lg)", background: "#0D0808", border: "1px solid var(--color-border)", overflowY: "auto", maxHeight: "500px", padding: "16px" }}
    >
      {logs.map((log) => {
        const time = new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const levelClass = LEVEL_CLASSES[log.level] ?? "log-line-info";
        const prefix = STEP_PREFIX[log.step] ?? "";

        return (
          <div key={log.id} className={levelClass} style={{ display: "flex", gap: "0", padding: "1px 0" }}>
            <span style={{ color: "var(--color-text-faint)", userSelect: "none", flexShrink: 0, fontVariantNumeric: "tabular-nums", width: "64px", textAlign: "right", paddingRight: "12px" }}>{time}</span>
            <span style={{ color: "var(--color-text-faint)", userSelect: "none", flexShrink: 0, width: "96px", paddingRight: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prefix}</span>
            <span style={{ wordBreak: "break-all" }}>{log.message}</span>
          </div>
        );
      })}
      {loading && (
        <div style={{ display: "flex", gap: "0", padding: "1px 0", color: "var(--color-text-faint)" }}>
          <span style={{ userSelect: "none", flexShrink: 0, fontVariantNumeric: "tabular-nums", width: "64px", textAlign: "right", paddingRight: "12px" }}>--:--:--</span>
          <span style={{ userSelect: "none", flexShrink: 0, width: "96px", paddingRight: "8px" }}>→</span>
          <span style={{ animation: "pulse 2s ease-in-out infinite" }}>building...</span>
        </div>
      )}
    </div>
  );
}
