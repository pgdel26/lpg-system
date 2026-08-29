import type { Branch } from "./types";

// ---------------------------------------------------------------------------
// The sidebar's contents as DATA, so one list drives three things: what the
// Sidebar renders, what the Restrictions screen offers as toggles, and what the
// route guard checks. Previously the nav existed only as JSX inside Sidebar,
// which would have meant maintaining a second copy of every item on the
// Restrictions page — and those two drifting is exactly how a tab ends up
// un-restrictable or a restriction ends up pointing at nothing.
//
// Pure module: no hooks, no Firestore. Importable anywhere.
// ---------------------------------------------------------------------------

/** Stable permission identifier for one navigable destination. */
export interface NavPermission {
  /** Stored in Firestore. Never change these — a rename silently un-restricts. */
  key: string;
  label: string;
  /** Where the key's screen lives. Outlet keys own everything under /{branch}. */
  href: string;
  /** Heading on the Restrictions screen. */
  group: string;
}

/**
 * Restrictions are stored as a DENY list, not an allow list. That way a tab
 * added later is visible to everyone by default rather than silently hidden
 * from every staff account until someone remembers to re-tick it.
 */
export const RESTRICTIONS_DOC = "settings/permissions";

/**
 * Screens only an admin may open. Kept SEPARATE from navPermissions on purpose:
 * these are gated by role, not by configuration, so they can never be
 * restricted away from the only account able to reach them. Restrictions itself
 * is the whole reason this list exists.
 */
export const ADMIN_ONLY_PATHS = ["/restrictions"];

export const isAdminOnlyPath = (pathname: string): boolean =>
  ADMIN_ONLY_PATHS.includes(pathname);

/**
 * Every restrictable destination, in sidebar order. Outlet rows are generated
 * per branch, so a third outlet becomes restrictable with no code change.
 *
 * The Restrictions screen itself is deliberately ABSENT: it is admin-only by
 * role, never by configuration, so it can't be hidden from the only account
 * able to reach it. Its sidebar row therefore carries no permission key.
 */
export function navPermissions(branches: Branch[]): NavPermission[] {
  return [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", group: "Overview" },

    ...branches.map((b) => ({
      key: `outlet:${b.id}`,
      label: b.name,
      href: `/${b.id}`,
      group: "Sales and Inventory",
    })),

    { key: "pricing", label: "Products & Pricing", href: "/pricing", group: "Company" },
    { key: "purchases", label: "Purchases", href: "/purchases", group: "Company" },
    { key: "receivables", label: "Accounts Receivable", href: "/receivables", group: "Company" },
    { key: "refunds", label: "Returns & Refunds", href: "/refunds", group: "Company" },

    { key: "customers", label: "Customers", href: "/customers", group: "Customer Management" },
    { key: "target-volume", label: "Target Volume", href: "/target-volume", group: "Customer Management" },

    { key: "income-statement", label: "Income Statement", href: "/income-statement", group: "Reports" },
    { key: "product-sales", label: "Monthly Sales", href: "/product-sales", group: "Reports" },
    { key: "reports", label: "Volume Per Customer", href: "/reports", group: "Reports" },

    { key: "staff", label: "Staff", href: "/staff", group: "Other" },
    { key: "contact", label: "Contact Us", href: "/contact", group: "Other" },
  ];
}

/**
 * The permission key a pathname belongs to, or null when nothing guards it.
 *
 * Outlet keys match a PREFIX (`/pili` and anything beneath it) because the
 * outlet page's legacy sub-routes still redirect through `/pili/sales`. Every
 * other key matches exactly, so an unrelated future route isn't accidentally
 * governed by a similarly-named one.
 */
export function permissionKeyForPath(
  pathname: string,
  branches: Branch[],
): string | null {
  const branch = branches.find(
    (b) => pathname === `/${b.id}` || pathname.startsWith(`/${b.id}/`),
  );
  if (branch) return `outlet:${branch.id}`;

  const match = navPermissions(branches).find(
    (p) => !p.key.startsWith("outlet:") && p.href === pathname,
  );
  return match?.key ?? null;
}
