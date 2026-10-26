import { useState } from "react";
import { Rocket } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token.trim()) {
      setError("Please enter a GitHub Personal Access Token");
      return;
    }

    try {
      await login(token.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "380px", animation: "fadeIn 0.2s ease-out" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "var(--radius-xl)", background: "rgba(122, 31, 43, 0.15)", border: "1px solid rgba(122, 31, 43, 0.2)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
            <Rocket style={{ width: "28px", height: "28px", color: "var(--color-maroon-400)" }} />
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 600, letterSpacing: "-0.025em", color: "var(--color-text-primary)" }}>RYME</h1>
          <p className="text-section-subtitle" style={{ marginTop: "8px" }}>Deploy with confidence</p>
        </div>

        <div className="card" style={{ padding: "32px" }}>
          <h2 className="text-section-title" style={{ textAlign: "center", marginBottom: "24px" }}>Sign in with GitHub</h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "16px" }}>
              <label className="text-label" style={{ display: "block", marginBottom: "6px" }}>
                GitHub Personal Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxx or github_pat_xxxx"
                disabled={isLoading}
                style={{
                  width: "100%", height: "40px", padding: "0 12px",
                  background: "var(--color-bg-primary)", color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
                  fontSize: "13px", fontFamily: "var(--font-mono)",
                  outline: "none", transition: "border-color 0.15s",
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "var(--color-maroon-400)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "var(--color-border)"}
              />
            </div>

            {error && (
              <p style={{ fontSize: "12px", color: "#f87171", marginBottom: "16px" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || !token.trim()}
              style={{
                width: "100%", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                background: "var(--color-maroon-400)", color: "#fff", border: "none", borderRadius: "var(--radius-md)",
                fontSize: "13px", fontWeight: 500, cursor: isLoading || !token.trim() ? "not-allowed" : "pointer",
                opacity: isLoading || !token.trim() ? 0.5 : 1, transition: "all 0.15s",
              }}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p style={{ fontSize: "11px", color: "var(--color-text-faint)", textAlign: "center", marginTop: "20px" }}>
            Development mode — your token is encrypted at rest
          </p>
        </div>
      </div>
    </div>
  );
}
