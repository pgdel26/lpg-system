"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";
import { AppDataProvider, useAppData } from "../../lib/providers/AppDataProvider";
import { auth } from "../../lib/firebase";
import LoginPage from "../../components/LoginPage";
import Sidebar from "../../components/Sidebar";
import { LoadingIcon, MenuIcon, UserIcon } from "../../components/Icons";
import { navPermissions, permissionKeyForPath, isAdminOnlyPath } from "../../lib/navigation";
import type { Branch } from "../../lib/types";
import styles from "./layout.module.css";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pricing": "Pricing",
  "/purchases": "Purchases",
  "/customers": "Customers",
  "/receivables": "Accounts Receivable",
  "/refunds": "Returns & Refunds",
  "/income-statement": "Income Statement",
  "/reports": "Customer Orders",
  "/product-sales": "Product Sales",
  "/staff": "Staff",
  "/restrictions": "Restrictions",
  "/notifications": "Notifications",
  "/contact": "Contact Us",
};

// An outlet's routes title as just the outlet name: the outlet page's own tab
// bar (views/outlet/OutletPage.tsx) sits directly beneath this header and
// already says which section you're on, so repeating it here read as a stutter.
function resolveTitle(pathname: string, branches: Branch[]): string {
  const segments = pathname.split("/").filter(Boolean);
  const branch = branches.find((b) => b.id === segments[0]);
  if (branch) return branch.name;
  return ROUTE_TITLES[pathname] || "";
}

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
  const router = useRouter();

  // Route guard. Hiding a sidebar item doesn't stop the URL being typed, so a
  // denied path bounces to the first screen the user IS allowed. This is still
  // only UX — it does not stop the browser reading Firestore directly (see
  // CLAUDE.md; the real boundary is security rules, which this project lacks).
  const deniedPath = useMemo(() => {
    // Admin-only screens are checked first: they carry no permission key, so
    // the restriction lookup below would wave them straight through.
    if (isAdminOnlyPath(pathname) && !data.isAdmin) return true;
    if (!data.permissionsLoaded) return false;
    const key = permissionKeyForPath(pathname, data.branches);
    return key !== null && !data.canAccess(key);
  }, [data, pathname]);

  const fallbackHref = useMemo(() => {
    const first = navPermissions(data.branches).find((p) => data.canAccess(p.key));
    // Contact Us is never restrictable to nothing in practice, but if a user
    // somehow has everything denied, sending them to /contact beats a redirect
    // loop or a blank screen.
    return first?.href || "/contact";
  }, [data]);

  useEffect(() => {
    if (deniedPath) router.replace(fallbackHref);
  }, [deniedPath, fallbackHref, router]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 60 : 250;
  const title = resolveTitle(pathname, data.branches);

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
              {/* The avatar is the button. Which account you're in matters now
                  that the menu differs by role, but the address was unreadable
                  as always-on grey text in the header — so it's revealed on
                  click instead, against its own opaque surface. */}
              <div className={styles.accountWrap}>
                <button
                  onClick={() => setAccountOpen((v) => !v)}
                  className={styles.avatarButton}
                  aria-haspopup="true"
                  aria-expanded={accountOpen}
                  aria-label="Account"
                  title="Account"
                >
                  {authUser.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={authUser.photoURL}
                      alt={authUser.displayName || ""}
                      className={styles.avatar}
                    />
                  ) : (
                    // Password accounts have no photoURL — the admin is one of
                    // them, so the generic fallback is the common case, not the
                    // edge case.
                    <span className={styles.avatarFallback}>
                      <UserIcon />
                    </span>
                  )}
                </button>

                {accountOpen && (
                  <>
                    {/* Invisible full-screen catcher, the same click-outside
                        pattern the app uses elsewhere. Rendered before the
                        panel so the panel stacks above it. */}
                    <div
                      className={styles.accountBackdrop}
                      onClick={() => setAccountOpen(false)}
                    />
                    <div className={styles.accountPanel}>
                      <span className={styles.accountLabel}>Signed in as</span>
                      <span className={styles.accountEmail}>{authUser.email || "—"}</span>
                      {authUser.displayName && (
                        <span className={styles.accountName}>{authUser.displayName}</span>
                      )}
                    </div>
                  </>
                )}
              </div>

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
