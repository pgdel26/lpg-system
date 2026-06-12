"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";
import { AppDataProvider, useAppData } from "../../lib/providers/AppDataProvider";
import { auth } from "../../lib/firebase";
import LoginPage from "../../components/LoginPage";
import Sidebar from "../../components/Sidebar";
import { LoadingIcon, MenuIcon } from "../../components/Icons";

const ROUTE_TITLES: Record<string, string> = {
  "/sales": "Sales",
  "/pricing": "Pricing",
  "/purchases": "Purchases",
  "/inventory": "Inventory",
  "/customers": "Customers",
  "/receivables": "Accounts Receivable",
  "/staff": "Staff",
  "/notifications": "Notifications",
  "/contact": "Contact Us",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authUser, authLoading, accessDenied, logout } = useAuth();

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <LoadingIcon />
      </div>
    );
  }
  if (!authUser) {
    return <LoginPage denied={accessDenied} deniedEmail={auth.currentUser?.email || ""} onRetry={logout} />;
  }

  return (
    <AppDataProvider currentUserEmail={authUser.email}>
      <DashboardChrome authUser={authUser} onLogout={logout}>{children}</DashboardChrome>
    </AppDataProvider>
  );
}

function DashboardChrome({
  authUser,
  onLogout,
  children,
}: {
  authUser: { email: string | null; photoURL: string | null; displayName: string | null };
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const data = useAppData();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 60 : 250;
  const title = ROUTE_TITLES[pathname] || "";

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Ambient glows */}
      <div style={{ position: "fixed", top: "-200px", right: "-200px", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-300px", left: "-200px", width: "700px", height: "700px", background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div style={{ marginLeft: `${sidebarWidth}px`, transition: "margin-left 0.25s ease", minHeight: "100vh" }}>
        {/* Header */}
        <header style={{
          padding: "16px 24px", borderBottom: "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 30,
          backdropFilter: "blur(20px)", background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.8)", display: "flex", padding: "4px",
              }}
            >
              <MenuIcon />
            </button>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
              {title}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-mono)" }}>
              {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </div>
            {/* User info + logout */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {authUser.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={authUser.photoURL}
                  alt={authUser.displayName || ""}
                  style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)" }}
                />
              )}
              <button
                onClick={onLogout}
                style={{
                  padding: "5px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.2)",
                  cursor: "pointer", background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.7)", fontSize: "11px", fontWeight: 600,
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main style={{ padding: "20px 24px" }}>
          {data.loading ? (
            <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
              <LoadingIcon />
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Connecting to Firebase...</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
