import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageIcon, TagIcon, UsersIcon, FlameIcon, ChevronLeftIcon, ChevronDownIcon, ListIcon, CartIcon, UserIcon, DollarIcon, PhoneIcon, BarChartIcon } from "./Icons";
import { useAppData } from "../lib/providers/AppDataProvider";
import { DEFAULT_BRANCH_ID } from "../lib/constants";
import styles from "./Sidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface BranchGroup {
  key: string;
  label: string;
  children: NavItem[];
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const data = useAppData();
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [accountingOpen, setAccountingOpen] = useState(true);
  // Per-branch sub-group open state, keyed by branch id. Absent = open (default).
  const [openBranchGroups, setOpenBranchGroups] = useState<Record<string, boolean>>({});
  const isBranchGroupOpen = (key: string) => openBranchGroups[key] ?? true;
  const toggleBranchGroup = (key: string) =>
    setOpenBranchGroups((prev) => ({ ...prev, [key]: !isBranchGroupOpen(key) }));

  // One sub-group per outlet — a third branch doc gets its own Sales/
  // Inventory pair with no code change. Purchases stays a single
  // company-wide screen under Accounting (not outlet-scoped).
  const operationsGroups: BranchGroup[] = data.branches.map((branch) => ({
    key: branch.id,
    label: branch.name,
    children: [
      { href: `/${branch.id}/sales`, label: "Sales", icon: <ListIcon /> },
      { href: `/${branch.id}/inventory`, label: "Inventory", icon: <PackageIcon /> },
    ],
  }));

  const accountingChildren: NavItem[] = [
    { href: "/income-statement", label: "Income Statement", icon: <BarChartIcon /> },
    { href: "/receivables", label: "Accounts Receivable", icon: <DollarIcon /> },
    { href: "/purchases", label: "Purchases", icon: <CartIcon /> },
    { href: "/pricing", label: "Products & Pricing", icon: <TagIcon /> },
  ];

  const operationsHrefs = operationsGroups.flatMap((g) => g.children.map((c) => c.href));
  const accountingHrefs = accountingChildren.map((c) => c.href);
  const isOperationsActive = operationsHrefs.includes(pathname);
  const isAccountingActive = accountingHrefs.includes(pathname);

  const renderNavLink = (item: NavItem, indentLevel: 0 | 1 | 2) => (
    <Link
      key={item.href}
      href={item.href}
      className={[
        styles.navLink,
        indentLevel === 1 ? styles.indented : "",
        indentLevel === 2 ? styles.doubleIndented : "",
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
    collapsed ? (
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

  // Operations is a 3-level group: Operations > outlet (PILI/CADLAN) > Sales/
  // Inventory/Purchases. When collapsed, flatten straight to icon-only leaves,
  // same as any other group — there's no room for two nested headers at 60px.
  const renderOperationsGroup = () => (
    collapsed ? (
      operationsGroups.flatMap((g) => g.children.map((item) => renderNavLink(item, 0)))
    ) : (
      <>
        <button
          onClick={() => setOperationsOpen(!operationsOpen)}
          className={`${styles.groupButton} ${isOperationsActive ? styles.active : ""}`}
        >
          <span className={styles.groupLabel}>Operations</span>
          <span className={`${styles.groupChevron} ${operationsOpen ? styles.open : styles.closed}`}>
            <ChevronDownIcon />
          </span>
        </button>
        {operationsOpen && operationsGroups.map((g) => {
          const isGroupActive = g.children.some((c) => c.href === pathname);
          const isGroupOpen = isBranchGroupOpen(g.key);
          return (
            <div key={g.key}>
              <button
                onClick={() => toggleBranchGroup(g.key)}
                className={`${styles.subGroupButton} ${isGroupActive ? styles.active : ""}`}
              >
                <span className={styles.subGroupLabel}>{g.label}</span>
                <span className={`${styles.groupChevron} ${isGroupOpen ? styles.open : styles.closed}`}>
                  <ChevronDownIcon />
                </span>
              </button>
              {isGroupOpen && g.children.map((item) => renderNavLink(item, 2))}
            </div>
          );
        })}
      </>
    )
  );

  return (
    <aside className={`${styles.aside} ${collapsed ? styles.collapsed : ""}`}>
      {/* Logo */}
      <Link href={`/${DEFAULT_BRANCH_ID}/sales`} className={styles.logoLink} title="Dashboard">
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
        {/* Operations group (Operations > outlet > Sales/Inventory/Purchases) */}
        {renderOperationsGroup()}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Accounting group */}
        {renderGroup("Accounting", accountingOpen, setAccountingOpen, accountingChildren, isAccountingActive)}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Customers */}
        {renderNavLink({ href: "/customers", label: "Customers", icon: <UsersIcon /> }, 0)}

        {/* Staff */}
        {renderNavLink({ href: "/staff", label: "Staff", icon: <UserIcon /> }, 0)}

        {/* Notifications — hidden until cron job is wired up */}
        {/* {renderNavLink({ href: "/notifications", label: "Notifications", icon: <MailIcon /> }, 0)} */}

        {/* Contact Us */}
        {renderNavLink({ href: "/contact", label: "Contact Us", icon: <PhoneIcon /> }, 0)}
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
