import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageIcon, TagIcon, UsersIcon, FlameIcon, ChevronLeftIcon, ChevronDownIcon, ListIcon, CartIcon, UserIcon, DollarIcon, PhoneIcon } from "./Icons";
import styles from "./Sidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [accountingOpen, setAccountingOpen] = useState(true);

  const operationsChildren: NavItem[] = [
    { href: "/sales", label: "Sales", icon: <ListIcon /> },
    { href: "/inventory", label: "Inventory", icon: <PackageIcon /> },
    { href: "/pricing", label: "Products & Pricing", icon: <TagIcon /> },
  ];

  const accountingChildren: NavItem[] = [
    { href: "/receivables", label: "Accounts Receivable", icon: <DollarIcon /> },
    { href: "/purchases", label: "Purchases", icon: <CartIcon /> },
  ];

  const operationsHrefs = operationsChildren.map((c) => c.href);
  const accountingHrefs = accountingChildren.map((c) => c.href);
  const isOperationsActive = operationsHrefs.includes(pathname);
  const isAccountingActive = accountingHrefs.includes(pathname);

  const renderNavLink = (item: NavItem, indent: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      className={[
        styles.navLink,
        indent ? styles.indented : "",
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
      children.map((item) => renderNavLink(item, false))
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
        {isOpen && children.map((item) => renderNavLink(item, true))}
      </>
    )
  );

  return (
    <aside className={`${styles.aside} ${collapsed ? styles.collapsed : ""}`}>
      {/* Logo */}
      <Link href="/sales" className={styles.logoLink} title="Dashboard">
        <div className={styles.logoIcon}>
          <FlameIcon />
        </div>
        {!collapsed && (
          <div className={styles.logoText}>
            <h1 className={styles.logoTitle}>PILI GASUL</h1>
            <p className={styles.logoSub}>Tracker</p>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className={styles.nav}>
        {/* Operations group */}
        {renderGroup("Operations", operationsOpen, setOperationsOpen, operationsChildren, isOperationsActive)}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Accounting group */}
        {renderGroup("Accounting", accountingOpen, setAccountingOpen, accountingChildren, isAccountingActive)}

        {/* Divider */}
        {!collapsed && <div className={styles.divider} />}

        {/* Customers */}
        {renderNavLink({ href: "/customers", label: "Customers", icon: <UsersIcon /> }, false)}

        {/* Staff */}
        {renderNavLink({ href: "/staff", label: "Staff", icon: <UserIcon /> }, false)}

        {/* Notifications — hidden until cron job is wired up */}
        {/* {renderNavLink({ href: "/notifications", label: "Notifications", icon: <MailIcon /> }, false)} */}

        {/* Contact Us */}
        {renderNavLink({ href: "/contact", label: "Contact Us", icon: <PhoneIcon /> }, false)}
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
