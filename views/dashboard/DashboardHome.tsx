import { useCallback, useMemo } from "react";
import { buildDashboardSummary, summarizePendingAr } from "../../lib/reports/dashboard";
import { permissionKeyForPath } from "../../lib/navigation";
import KpiRow from "./KpiRow";
import QuickEntry from "./QuickEntry";
import LowStockCard from "./LowStockCard";
import ActivityFeed from "./ActivityFeed";
import type {
  Branch, SaleTransaction, Swap, Refund, Expense, Staff, InventoryCell,
} from "../../lib/types";
import styles from "./DashboardHome.module.css";

interface DashboardHomeProps {
  /** The day being reported on — always today; the screen has no date filter. */
  date: string;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  expenses: Expense[];
  /** Only used to name salary expenses in the Expenses card. */
  staff: Staff[];
  arTransactions: SaleTransaction[];
  onHandByBranch: Record<string, Record<string, InventoryCell>>;
  cylinderProducts: string[];
  branches: Branch[];
  /** Outlet the branch-scoped links point at. */
  defaultBranchId: string;
  /**
   * The provider's nav gate. The dashboard is full of shortcuts INTO restricted
   * screens, and offering a staff user a tile that bounces them straight back
   * makes the restriction read as a broken app rather than a restriction.
   */
  canAccess: (key: string) => boolean;
  loading: boolean;
  error: string | null;
}

/** "Friday, 22 August 2026" from a bare YYYY-MM-DD. */
function fullDateLabel(date: string): string {
  // T00:00:00 forces local-midnight parsing; new Date("YYYY-MM-DD") is UTC and
  // renders as the previous day in Manila.
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default function DashboardHome({
  date,
  saleTransactions,
  swaps,
  refunds,
  expenses,
  staff,
  arTransactions,
  onHandByBranch,
  cylinderProducts,
  branches,
  defaultBranchId,
  canAccess,
  loading,
  error,
}: DashboardHomeProps) {
  const summary = useMemo(
    () => buildDashboardSummary({
      saleTransactions, swaps, refunds, expenses, staff, arTransactions,
      date, branches, onHandByBranch, cylinderProducts,
    }),
    [saleTransactions, swaps, refunds, expenses, staff, arTransactions,
      date, branches, onHandByBranch, cylinderProducts],
  );

  const pendingAr = useMemo(() => summarizePendingAr(arTransactions), [arTransactions]);

  // Keyed off the href rather than a hand-maintained list, so a link added here
  // later is gated automatically and can't drift from the sidebar. A path
  // lib/navigation.ts doesn't guard (null key) is open to everyone.
  const canOpen = useCallback((href: string) => {
    const key = permissionKeyForPath(href, branches);
    return key ? canAccess(key) : true;
  }, [branches, canAccess]);

  // Falls back to the first configured outlet so the branch-scoped links still
  // work if DEFAULT_BRANCH_ID ever names a branch that isn't in the collection.
  const branch = branches.find((b) => b.id === defaultBranchId) || branches[0];
  const branchId = branch?.id || defaultBranchId;

  return (
    <div className="animate-fade">
      <div className={styles.header}>
        <h1 className={styles.heading}>Overview</h1>
        <p className={styles.subtitle}>
          Metrics across all active outlets · {fullDateLabel(date)}
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading dashboard…</div>
      ) : (
        <>
          <KpiRow summary={summary} pendingAr={pendingAr} canOpen={canOpen} />

          {/* Full width: with one tile per outlet the row is five wide, and it
              reads as a toolbar for the whole screen rather than something
              belonging to the column beneath it. */}
          <div className={styles.quickEntryRow}>
            <QuickEntry branches={branches} expenseBranchId={branchId} canOpen={canOpen} />
          </div>

          <div className={styles.mainGrid}>
            <ActivityFeed rows={summary.feed} branches={branches} canOpen={canOpen} />
            <LowStockCard
              rows={summary.lowStock}
              missingOutlets={summary.outletsMissingInventory}
              inventoryHref={`/${branchId}`}
              canOpen={canOpen}
            />
          </div>
        </>
      )}
    </div>
  );
}
