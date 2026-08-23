import { useState, useCallback } from "react";
import { fetchRangeCollection } from "../firestoreRange";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { FULL_SECTION, VELOCITY_DAYS, addDays } from "../reports/dashboard";
import type { SaleTransaction, Swap, Refund, Expense, InventoryCell, DailyInventoryDoc } from "../types";

export interface DashboardRangeData {
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  expenses: Expense[];
  /** branch id -> product -> that product's `full` cell for the reported date. */
  onHandByBranch: Record<string, Record<string, InventoryCell>>;
}

export interface UseDashboardData {
  loading: boolean;
  error: string | null;
  data: DashboardRangeData | null;
  fetchFor: (date: string, branchIds: string[]) => Promise<void>;
}

export function useDashboardData(): UseDashboardData {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardRangeData | null>(null);

  const fetchFor = useCallback(async (date: string, branchIds: string[]): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Only ONE collection needs history: sales, for the 30-day velocity behind
      // days-of-cover. Swaps, refunds and expenses are consumed a single day at
      // a time (see the onDate() calls in lib/reports/dashboard.ts), and the
      // day-over-day trend that used to need a second day is gone. This is the
      // landing page, so it runs on every app open — three extra 30-day range
      // queries per load is real read cost for data nothing looks at.
      const startDate = addDays(date, -(VELOCITY_DAYS - 1));

      // dailyInventory doc IDs are deterministic (`{date}_{branch}_{section}`),
      // so today's on-hand is a direct get per outlet — no query, no index.
      const [saleTransactions, swaps, refunds, expenses, inventorySnaps] = await Promise.all([
        fetchRangeCollection<SaleTransaction>("saleTransactions", startDate, date),
        fetchRangeCollection<Swap>("swaps", date, date),
        fetchRangeCollection<Refund>("refunds", date, date),
        fetchRangeCollection<Expense>("expenses", date, date),
        Promise.all(
          branchIds.map(async (branchId) => ({
            branchId,
            snap: await getDoc(doc(db, "dailyInventory", `${date}_${branchId}_${FULL_SECTION}`)),
          })),
        ),
      ]);

      const onHandByBranch: Record<string, Record<string, InventoryCell>> = {};
      for (const { branchId, snap } of inventorySnaps) {
        // A missing doc means nothing has been entered for that outlet today.
        // Left as {}, which buildDashboardSummary reads as "not counted" (and
        // names in outletsMissingInventory) rather than as zero stock.
        onHandByBranch[branchId] = snap.exists()
          ? ((snap.data() as DailyInventoryDoc).items || {})
          : {};
      }

      setData({ saleTransactions, swaps, refunds, expenses, onHandByBranch });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to load dashboard data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, data, fetchFor };
}
