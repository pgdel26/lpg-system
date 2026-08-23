import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageIcon, TagIcon, UsersIcon, FlameIcon, ChevronLeftIcon, ChevronDownIcon, ListIcon, CartIcon, UserIcon, DollarIcon, PhoneIcon, BarChartIcon, ClipboardCheckIcon, DashboardIcon, BriefcaseIcon } from "./Icons";
import { useAppData } from "../lib/providers/AppDataProvider";
import type { Branch } from "../lib/types";
import styles from "./Sidebar.module.css";

/**
 * Menu label for an outlet: the branch doc's own name in normal caps.
 *
 * Case only — nothing is appended. The doc already names the head outlet
 * "PILI (MAIN)", so adding a derived "(Main)" rendered "Pili (Main) (Main)".
 * Which outlet is the main one is the owner's label, recorded in the branch
 * name; deriving it a second time from DEFAULT_BRANCH_ID duplicated a fact the
 * data already carried. To move that marker, rename the branch doc.
 *
 * Formatted at READ time rather than by renaming the doc, because `branch.name`
 * also renders on the dashboard's KPI cards, activity feed and low-stock alerts
 * — this is a menu preference, not a change to the record.
 */
const outletLabel = (branch: Branch): string =>
  branch.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /**
   * Permission key from lib/navigation.ts. Every RESTRICTABLE item carries one,
   * so a tab can't be added to the sidebar while being un-restrictable — if you
   * can see it here, the Restrictions screen can hide it. Omitted only by rows
   * gated on role instead (Restrictions itself), which navPermissions()
   * deliberately does not list.
   */
  permission?: string;
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const data = useAppData();
  const [salesInventoryOpen, setSalesInventoryOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(true);

  // One link per outlet — Sales and Inventory are sections of that outlet's own
  // page now (see [branch]/layout.tsx), so they no longer need nav rows of their
  // own. A third branch doc adds itself here with no code change. Purchases
  // stays a company-wide screen above, since deliveries aren't per outlet.
  const outletLinks: NavItem[] = data.branches.map((branch) => ({
    href: `/${branch.id}`,
    label: outletLabel(branch),
    icon: <PackageIcon />,
    permission: `outlet:${branch.id}`,
  }));

  // Company-wide screens, flat rather than grouped: with only three of them a
  // collapsible "Accounting" header cost a click to reach anything without
  // shortening the list.
  const companyLinks: NavItem[] = [
    { href: "/pricing", label: "Products & Pricing", icon: <TagIcon />, permission: "pricing" },
    { href: "/purchases", label: "Purchases", icon: <CartIcon />, permission: "purchases" },
    { href: "/receivables", label: "Accounts Receivable", icon: <DollarIcon />, permission: "receivables" },
    // Sits under A/R: a return is money owed back, so it reads with the
    // receivables rather than with the outlet that happened to take it in.
    { href: "/refunds", label: "Returns & Refunds", icon: <ListIcon />, permission: "refunds" },
  ];

  // One child per report, so the sidebar advertises which reports exist. A new
  // report is a row here plus its route.
  const reportChildren: NavItem[] = [
    { href: "/income-statement", label: "Income Statement", icon: <BarChartIcon />, permission: "income-statement" },
    { href: "/reports", label: "Customer Orders", icon: <ClipboardCheckIcon />, permission: "reports" },
  ];

  // Matches the outlet page itself AND anything nested under it, so the row
  // stays lit on /pili, on the legacy /pili/sales redirect, and on any future
  // /pili/... route. The row stands for the whole outlet page now that Sales
  // and Inventory are tabs within it.
  const isSalesInventoryActive = data.branches.some(
    (b) => pathname === `/${b.id}` || pathname.startsWith(`/${b.id}/`),
  );
  const isReportsActive = reportChildren.some((c) => c.href === pathname);

  // One gate, applied to every list before it renders. A group with all its
  // children hidden disappears entirely rather than leaving an empty header.
  // A row with no permission key is role-gated at its own call site rather than
  // restrictable, so it never reaches this filter — see NavItem.permission.
  const allowed = (items: NavItem[]) =>
    items.filter((i) => !i.permission || data.canAccess(i.permission));

  const renderNavLink = (item: NavItem, indentLevel: 0 | 1) => (
    <Link
      key={item.href}
      href={item.href}
      className={[
        styles.navLink,
        indentLevel === 1 ? styles.indented : "",
        pathname === item.href ? styles.active : "",
      ].join(" ")}
      title={collapsed ? item.label : undefined}
    >
      <span className={styles.navIcon}>{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );

  const renderGroup = (
    label: string,
    isOpen: boolean,
    setIsOpen: (v: boolean) => void,
    children: NavItem[],
    isActive: boolean,
  ) => (
    children.length === 0 ? null : collapsed ? (
      children.map((item) => renderNavLink(item, 0))
    ) : (
      <>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`${styles.groupButton} ${isActive ? styles.active : ""}`}
        >
          <span className={styles.groupLabel}>{label}</span>
          <span className={`${styles.groupChevron} ${isOpen ? styles.open : styles.closed}`}>
            <ChevronDownIcon />
          </span>
        </button>
        {isOpen && children.map((item) => renderNavLink(item, 1))}
      </>
    )
  );

  return (
    <aside className={`${styles.aside} ${collapsed ? styles.collapsed : ""}`}>
      {/* Logo */}
      <Link href="/dashboard" className={styles.logoLink} title="Dashboard">
        <div className={styles.logoIcon}>
          <FlameIcon />
        </div>
        {!collapsed && (
          <div className={styles.logoText}>
            <h1 className={styles.logoTitle}>TANK TRACKER</h1>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className={styles.nav}>
        {/* Company-wide overview — above everything, since it spans every
            outlet and belongs to neither. */}
        {data.canAccess("dashboard")
          && renderNavLink({ href: "/dashboard", label: "DASHBOARD", icon: <DashboardIcon />, permission: "dashboard" }, 0)}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Sales and Inventory — one row per outlet; the two sections are tabs
            on that outlet's own page. Sits directly under the dashboard: it's
            the day-to-day work, so it comes before the company-wide screens. */}
        {renderGroup("Sales and Inventory", salesInventoryOpen, setSalesInventoryOpen,
          allowed(outletLinks), isSalesInventoryActive)}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Company-wide screens */}
        {allowed(companyLinks).map((item) => renderNavLink(item, 0))}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Reports group */}
        {renderGroup("Reports", reportsOpen, setReportsOpen, allowed(reportChildren), isReportsActive)}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Customers */}
        {data.canAccess("customers")
          && renderNavLink({ href: "/customers", label: "Customers", icon: <UsersIcon />, permission: "customers" }, 0)}

        {/* Staff */}
        {data.canAccess("staff")
          && renderNavLink({ href: "/staff", label: "Staff", icon: <UserIcon />, permission: "staff" }, 0)}

        {/* Admin-only, and deliberately NOT permission-gated: it's the screen
            that edits permissions, so making it restrictable would allow
            locking the only account that can undo it out of it. */}
        {data.isAdmin
          && renderNavLink({ href: "/restrictions", label: "Restrictions", icon: <BriefcaseIcon /> }, 0)}

        {/* Notifications — hidden until cron job is wired up */}
        {/* {renderNavLink({ href: "/notifications", label: "Notifications", icon: <MailIcon /> }, 0)} */}

        {/* Contact Us */}
        {data.canAccess("contact")
          && renderNavLink({ href: "/contact", label: "Contact Us", icon: <PhoneIcon />, permission: "contact" }, 0)}
      </nav>

      {/* Collapse toggle */}
      <button onClick={onToggle} className={styles.toggleButton}>
        <span className={`${styles.toggleChevron} ${collapsed ? styles.collapsed : ""}`}>
          <ChevronLeftIcon />
        </span>
      </button>
    </aside>
  );
}
