import { useMemo, useState } from "react";
import { today, formatDateShort, presetThisMonth, presetLastMonth } from "../../lib/utils";
import {
  computeIncomeStatement, exportIncomeStatementWorkbook, partitionByBranch,
} from "../../lib/reports/incomeStatement";
import { collectionEventsInRange } from "../../lib/receivables";
import IncomeStatementBreakdown from "./IncomeStatementBreakdown";
import DiscountsByCustomerCard from "./DiscountsByCustomerCard";
import { LoadingIcon, DownloadIcon } from "../../components/Icons";
import type { SaleTransaction, Swap, Refund, Purchase, Expense, Staff, Branch, PurchaseDelivery } from "../../lib/types";
import styles from "./IncomeStatementPage.module.css";

interface IncomeStatementPageProps {
  startDate: string;
  endDate: string;
  onChangeRange: (start: string, end: string) => void;
  loading: boolean;
  error: string | null;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  purchases: Purchase[];
  purchaseDeliveries: PurchaseDelivery[];
  expenses: Expense[];
  /** Roster, only used to name salary expenses in the breakdown. */
  staff: Staff[];
  branches: Branch[];
  /** Unbounded, live AR doc list — NOT date-ranged. See IncomeStatementInput. */
  arTransactions: SaleTransaction[];
}

function presetThisYear(todayStr: string): { start: string; end: string } {
  const y = Number(todayStr.split("-")[0]);
  return { start: `${y}-01-01`, end: todayStr };
}

export default function IncomeStatementPage({
  startDate,
  endDate,
  onChangeRange,
  loading,
  error,
  saleTransactions,
  swaps,
  refunds,
  purchases,
  purchaseDeliveries,
  expenses,
  staff,
  branches,
  arTransactions,
}: IncomeStatementPageProps) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const combinedResult = useMemo(
    () => computeIncomeStatement({ saleTransactions, swaps, refunds, purchases, purchaseDeliveries, expenses, arTransactions, startDate, endDate }),
    [saleTransactions, swaps, refunds, purchases, purchaseDeliveries, expenses, arTransactions, startDate, endDate],
  );

  // Partition each collection by branch from a single unfiltered fetch — never
  // filter at the query level, since a doc with a missing/unrecognized branch
  // would then silently vanish from every total instead of surfacing as
  // "Unassigned." This is what keeps PILI + CADLAN + Unassigned == Combined.
  const { perBranchResults, unassignedCount } = useMemo(() => {
    const branchIds = branches.map((b) => b.id);
    const salesPart = partitionByBranch(saleTransactions, branchIds);
    const swapsPart = partitionByBranch(swaps, branchIds);
    const refundsPart = partitionByBranch(refunds, branchIds);
    const purchasesPart = partitionByBranch(purchases, branchIds);
    const expensesPart = partitionByBranch(expenses, branchIds);

    const perBranch = branches.map((branch) => ({
      branch,
      // arTransactions is passed UNPARTITIONED to every branch — a
      // collection is attributed by where the cash was received (the
      // event's own branch, filtered inside computeIncomeStatement), not by
      // the invoice's origin branch, so partitioning the AR docs themselves
      // would misattribute cash collected at one outlet to the other.
      result: computeIncomeStatement({
        saleTransactions: salesPart.byBranch[branch.id],
        swaps: swapsPart.byBranch[branch.id],
        refunds: refundsPart.byBranch[branch.id],
        purchases: purchasesPart.byBranch[branch.id],
        // Passed UNPARTITIONED: computeIncomeStatement narrows these by its own
        // `branch` argument (they carry a branch field, unlike the doc lists
        // partitioned above).
        purchaseDeliveries,
        expenses: expensesPart.byBranch[branch.id],
        arTransactions,
        startDate,
        endDate,
        branch: branch.id,
      }),
    }));

    // Collection events (not the AR docs themselves — see the comment above)
    // whose own branch is missing/unrecognized. Without this, a collection
    // that can't be attributed to an outlet counts in All Outlets' cash
    // figures but neither outlet tab's, silently breaking the
    // "PILI + CADLAN + Unassigned == Combined" promise this warning exists for.
    const unassignedCollections = startDate && endDate
      ? collectionEventsInRange(arTransactions, startDate, endDate).filter(({ event }) => !event.branch || !branchIds.includes(event.branch)).length
      : 0;

    const unassigned = salesPart.unassigned.length + swapsPart.unassigned.length
      + refundsPart.unassigned.length + purchasesPart.unassigned.length + expensesPart.unassigned.length
      + unassignedCollections;

    return { perBranchResults: perBranch, unassignedCount: unassigned };
  }, [saleTransactions, swaps, refunds, purchases, purchaseDeliveries, expenses, branches, arTransactions, startDate, endDate]);

  // Includes AR collections — a period whose only money event is a
  // collection (invoice sold earlier, paid this period) still has real cash
  // movement to show, even with zero sales/swaps/purchases/refunds/expenses
  // of its own.
  const hasData = saleTransactions.length > 0 || swaps.length > 0 || purchases.length > 0
    || refunds.length > 0 || expenses.length > 0
    || combinedResult.arCollectedTotal > 0;

  const activeResult = activeTab === "all"
    ? combinedResult
    : (perBranchResults.find((p) => p.branch.id === activeTab)?.result || combinedResult);

  const handleExport = () => {
    exportIncomeStatementWorkbook({
      startDate,
      endDate,
      branchResults: perBranchResults.map((p) => ({ label: p.branch.name, result: p.result })),
      combinedResult,
    });
  };

  return (
    <div className="animate-fade">
      {/* Period picker */}
      <div className={styles.periodBar}>
        <div className={styles.customRange}>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => onChangeRange(e.target.value > endDate ? endDate : e.target.value, endDate)}
            className={styles.dateInput}
          />
          <span className={styles.rangeSep}>to</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => onChangeRange(startDate, e.target.value < startDate ? startDate : e.target.value)}
            className={styles.dateInput}
          />
        </div>
        <button className={styles.presetButton} onClick={() => { const r = presetThisMonth(today()); onChangeRange(r.start, r.end); }}>
          This Month
        </button>
        <button className={styles.presetButton} onClick={() => { const r = presetLastMonth(today()); onChangeRange(r.start, r.end); }}>
          Last Month
        </button>
        <button className={styles.presetButton} onClick={() => { const r = presetThisYear(today()); onChangeRange(r.start, r.end); }}>
          This Year
        </button>
        <button className={styles.exportButton} onClick={handleExport}>
          <DownloadIcon /> Export
        </button>
      </div>

      <div className={styles.periodLabel}>
        {formatDateShort(startDate)} &ndash; {formatDateShort(endDate)}
      </div>

      {/* Outlet tabs */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabButton} ${activeTab === "all" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Outlets
        </button>
        {branches.map((b) => (
          <button
            key={b.id}
            className={`${styles.tabButton} ${activeTab === b.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>

      {unassignedCount > 0 && (
        <div className={styles.unassignedWarning}>
          {unassignedCount} record{unassignedCount !== 1 ? "s" : ""} without a recognized outlet —
          included in All Outlets, excluded from individual outlet tabs.
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>
          <LoadingIcon />
          <p>Loading income statement...</p>
        </div>
      ) : error ? (
        <div className={styles.errorState}>{error}</div>
      ) : !hasData ? (
        <div className={styles.emptyState}>No transactions recorded for this period.</div>
      ) : (
        <div className={styles.pageLayout}>
          <div className={styles.mainColumn}>
            <IncomeStatementBreakdown result={activeResult} staff={staff} isPerBranchView={activeTab !== "all"} />
          </div>
          {activeResult.discountsByCustomer.length > 0 && (
            <div className={styles.rightCol}>
              <DiscountsByCustomerCard result={activeResult} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
