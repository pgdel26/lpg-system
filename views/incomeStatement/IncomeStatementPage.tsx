import { useMemo, useState } from "react";
import { fmt, today } from "../../lib/utils";
import {
  computeIncomeStatement, exportIncomeStatementWorkbook, partitionByBranch,
} from "../../lib/reports/incomeStatement";
import IncomeStatementBreakdown from "./IncomeStatementBreakdown";
import { LoadingIcon, DownloadIcon } from "../../components/Icons";
import type { SaleTransaction, Swap, Refund, Purchase, Expense, Branch } from "../../lib/types";
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
  expenses: Expense[];
  branches: Branch[];
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number): string => `${y}-${pad2(m)}-${pad2(d)}`;

function presetThisMonth(todayStr: string): { start: string; end: string } {
  const [y, m] = todayStr.split("-").map(Number);
  return { start: ymd(y, m, 1), end: todayStr };
}

function presetLastMonth(todayStr: string): { start: string; end: string } {
  const [y, m] = todayStr.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  return { start: ymd(prevY, prevM, 1), end: ymd(prevY, prevM, lastDay) };
}

function presetThisYear(todayStr: string): { start: string; end: string } {
  const y = Number(todayStr.split("-")[0]);
  return { start: ymd(y, 1, 1), end: todayStr };
}

// Bare "YYYY-MM-DD" strings must be parsed with an explicit local-midnight
// time component — new Date("YYYY-MM-DD") parses as UTC and can render as
// the wrong calendar day depending on the browser's timezone.
const formatDateLabel = (dateStr: string): string =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

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
  expenses,
  branches,
}: IncomeStatementPageProps) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const combinedResult = useMemo(
    () => computeIncomeStatement({ saleTransactions, swaps, refunds, purchases, expenses }),
    [saleTransactions, swaps, refunds, purchases, expenses],
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
      result: computeIncomeStatement({
        saleTransactions: salesPart.byBranch[branch.id],
        swaps: swapsPart.byBranch[branch.id],
        refunds: refundsPart.byBranch[branch.id],
        purchases: purchasesPart.byBranch[branch.id],
        expenses: expensesPart.byBranch[branch.id],
      }),
    }));

    const unassigned = salesPart.unassigned.length + swapsPart.unassigned.length
      + refundsPart.unassigned.length + purchasesPart.unassigned.length + expensesPart.unassigned.length;

    return { perBranchResults: perBranch, unassignedCount: unassigned };
  }, [saleTransactions, swaps, refunds, purchases, expenses, branches]);

  const hasData = saleTransactions.length > 0 || swaps.length > 0 || purchases.length > 0
    || refunds.length > 0 || expenses.length > 0;

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
        {formatDateLabel(startDate)} &ndash; {formatDateLabel(endDate)}
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
        <>
          {activeTab === "all" && (
            <div className={styles.comparisonStrip}>
              {perBranchResults.map(({ branch, result }) => (
                <div key={branch.id} className={styles.comparisonCard}>
                  <div className={styles.comparisonName}>{branch.name}</div>
                  <div className={styles.comparisonRow}><span>Net Revenue</span><span>{fmt(result.netRevenue)}</span></div>
                  <div className={styles.comparisonRow}><span>Gross Profit</span><span>{fmt(result.grossProfit)}</span></div>
                  <div className={styles.comparisonRow}>
                    <span>Margin</span>
                    <span>
                      {result.grossMarginPct === null ? "—" : `${result.grossMarginPct.toFixed(1)}%${result.hasTransferActivity ? "*" : ""}`}
                    </span>
                  </div>
                  <div className={styles.comparisonRow}><span>Operating Result</span><span>{fmt(result.operatingResult)}</span></div>
                </div>
              ))}
            </div>
          )}

          <IncomeStatementBreakdown result={activeResult} />
        </>
      )}
    </div>
  );
}
