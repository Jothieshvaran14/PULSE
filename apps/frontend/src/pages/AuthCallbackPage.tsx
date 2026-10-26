import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../api/auth";
import { Rocket } from "lucide-react";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setError("Missing authorization code. Please try logging in again.");
      return;
    }

    let cancelled = false;
    let completed = false;

    authApi
      .handleCallback(code, state)
      .then((result) => {
        if (!cancelled && !completed) {
          completed = true;
          setAuth(result.token, result.user);
          navigate("/", { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled && !completed) {
          completed = true;
          console.error("OAuth callback error:", err);
          setError(err.message || "Authentication failed. Please try again.");
        }
      });

    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ textAlign: "center", animation: "fadeIn 0.2s ease-out" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "var(--radius-xl)", background: "var(--color-error-dim)", border: "1px solid rgba(239, 68, 68, 0.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
            <span style={{ color: "#f87171", fontSize: "20px", fontWeight: 500 }}>!</span>
          </div>
          <h1 style={{ fontSize: "18px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "8px" }}>Authentication Failed</h1>
          <p className="text-body" style={{ marginBottom: "24px" }}>{error}</p>
          <a href="/login" className="btn btn-primary" style={{ textDecoration: "none" }}>Back to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ textAlign: "center", animation: "fadeIn 0.2s ease-out" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "var(--radius-xl)", background: "rgba(122, 31, 43, 0.15)", border: "1px solid rgba(122, 31, 43, 0.2)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "24px", animation: "pulse 2s ease-in-out infinite" }}>
          <Rocket style={{ width: "28px", height: "28px", color: "var(--color-maroon-400)" }} />
        </div>
        <h1 style={{ fontSize: "18px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>Completing sign in...</h1>
        <p className="text-body">Verifying your GitHub credentials</p>
      </div>
    </div>
  );
}
