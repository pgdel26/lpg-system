import Link from "next/link";
import { ListIcon, DollarIcon, ClipboardCheckIcon, CartIcon } from "../../components/Icons";
import type { Branch } from "../../lib/types";
import styles from "./QuickEntry.module.css";

interface QuickEntryProps {
  branches: Branch[];
  /**
   * Outlet whose Sales screen hosts the expense form. Expenses are recorded
   * from the Sales Report subtab (see SalesReportTab), which is component
   * state rather than a URL segment, so this can only land on the screen —
   * deep-linking straight to the form would mean putting the subtab in the URL.
   */
  expenseBranchId: string;
  /** Hides a tile whose destination this account can't reach. */
  canOpen: (href: string) => boolean;
}

interface Tile {
  key: string;
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
}

/**
 * Shortcuts, not inline forms. Every one of these writes is branch-scoped or
 * lives inside a flow with its own considerable state (pricebook lookup,
 * multi-payment split, FIFO allocation across invoices), and duplicating them
 * here would mean two entry points to keep in step for the app's money-writing
 * paths.
 */
export default function QuickEntry({ branches, expenseBranchId, canOpen }: QuickEntryProps) {
  // One Record Sale tile per outlet, generated from the branches collection
  // rather than hardcoded — a third outlet has to be addable by adding a doc,
  // not by editing this file.
  const tiles: Tile[] = [
    ...branches.map((branch) => ({
      key: `sale-${branch.id}`,
      href: `/${branch.id}`,
      icon: <ListIcon />,
      label: `Record Sale — ${branch.name}`,
      sub: "New transaction",
    })),
    {
      key: "ar",
      href: "/receivables",
      icon: <DollarIcon />,
      label: "A/R Collection",
      sub: "Receive payment",
    },
    {
      key: "expense",
      href: `/${expenseBranchId}`,
      icon: <ClipboardCheckIcon />,
      label: "Record Expense",
      sub: "Log outgoing",
    },
    {
      // Purchases is deliberately one company-wide screen, not per-outlet, so
      // this tile carries no branch.
      key: "purchase",
      href: "/purchases",
      icon: <CartIcon />,
      label: "Record Purchase",
      sub: "Log delivery",
    },
  ];

  const visibleTiles = tiles.filter((tile) => canOpen(tile.href));

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Quick Entry</span>
      </div>
      <div className={styles.tiles}>
        {visibleTiles.map((tile) => (
          <Link key={tile.key} href={tile.href} className={styles.tile}>
            <span className={styles.tileIcon}>{tile.icon}</span>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileSub}>{tile.sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
