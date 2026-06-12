"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";
import { AppDataProvider, useAppData } from "../../lib/providers/AppDataProvider";
import { auth } from "../../lib/firebase";
import LoginPage from "../../components/LoginPage";
import Sidebar from "../../components/Sidebar";
import { LoadingIcon, MenuIcon } from "../../components/Icons";
import styles from "./layout.module.css";

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
      <div className={styles.authLoading}>
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
    <div className={styles.root}>
      {/* Ambient glows */}
      <div className={styles.glowTop} />
      <div className={styles.glowBottom} />

      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className={styles.contentArea} style={{ marginLeft: `${sidebarWidth}px` }}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={styles.menuButton}
            >
              <MenuIcon />
            </button>
            <h2 className={styles.pageTitle}>
              {title}
            </h2>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.dateText}>
              {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </div>
            {/* User info + logout */}
            <div className={styles.userRow}>
              {authUser.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={authUser.photoURL}
                  alt={authUser.displayName || ""}
                  className={styles.avatar}
                />
              )}
              <button
                onClick={onLogout}
                className={styles.signOutButton}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          {data.loading ? (
            <div className={styles.loadingGate}>
              <LoadingIcon />
              <p className={styles.loadingText}>Connecting to Firebase...</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
