import { Settings, Construction } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="text-page-title">Settings</h1>
          <p className="text-section-subtitle">Platform configuration</p>
        </div>
      </div>

      <div className="card" style={{ padding: "80px 24px", textAlign: "center" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "var(--radius-lg)", background: "var(--color-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Construction style={{ width: "24px", height: "24px", color: "var(--color-text-faint)" }} />
        </div>
        <h2 className="text-section-title" style={{ marginBottom: "8px" }}>Coming in Phase 2</h2>
        <p className="text-body" style={{ maxWidth: "400px", margin: "0 auto" }}>
          Environment variables, custom domains, build configuration, and platform preferences.
        </p>
        <div style={{ marginTop: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }} className="text-caption">
          <Settings style={{ width: "12px", height: "12px" }} />
          <span>Phase 1 — Core Deployment Pipeline</span>
        </div>
      </div>
    </div>
  );
}
