import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderGit2,
  Settings,
  Rocket,
  Heart,
  LogOut,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { healthApi } from "../../api/health";
import { useAuth } from "../../contexts/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/projects", icon: FolderGit2, label: "Projects" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => healthApi.check(),
    refetchInterval: 30000,
  });

  const isHealthy = health?.data?.status === "healthy";

  return (
    <div className="layout-shell">
      {/* Sidebar */}
      <aside className="layout-sidebar">
        {/* Logo */}
        <div style={{ padding: "20px 20px 24px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: "var(--color-maroon-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Rocket style={{ width: "16px", height: "16px", color: "#fff" }} />
            </div>
            <span style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-text-primary)" }}>
              RYME
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: isActive ? "var(--color-maroon-400)" : "var(--color-text-muted)",
                  background: isActive ? "rgba(122, 31, 43, 0.12)" : "transparent",
                  textDecoration: "none",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon style={{ width: "16px", height: "16px" }} />
                {label}
              </NavLink>
            );
          })}
        </nav>

        {/* Health */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
            <Heart
              style={{ width: "12px", height: "12px", color: isHealthy ? "var(--color-success)" : "var(--color-error)" }}
              fill={isHealthy ? "currentColor" : "none"}
            />
            <span style={{ color: "var(--color-text-muted)" }}>
              {isHealthy ? "Operational" : "Degraded"}
            </span>
          </div>
        </div>

        {/* User */}
        {user && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "4px" }}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.githubLogin}
                  style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--color-border)" }}
                />
              ) : (
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(122, 31, 43, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-maroon-400)", fontSize: "13px", fontWeight: 500 }}>
                  {(user.name || user.githubLogin).charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name || user.githubLogin}
                </p>
                <p style={{ fontSize: "11px", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  @{user.githubLogin}
                </p>
              </div>
              <button
                onClick={logout}
                style={{ padding: "6px", color: "var(--color-text-faint)", background: "none", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", transition: "color 0.15s" }}
                title="Sign out"
              >
                <LogOut style={{ width: "14px", height: "14px" }} />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
