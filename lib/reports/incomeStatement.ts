import * as XLSX from "xlsx-js-style";
import { titleCaseCategory } from "../utils";
import type { SaleTransaction, Swap, Refund, Purchase, Expense } from "../types";

export interface IncomeStatementLine {
  label: string;
  amount: number;
  count: number;
}

export interface IncomeStatementInput {
  saleTransactions?: SaleTransaction[];
  swaps?: Swap[];
  refunds?: Refund[];
  purchases?: Purchase[];
  expenses?: Expense[];
}

export interface IncomeStatementResult {
  revenueLines: IncomeStatementLine[];
  swapRevenue: number;
  swapCount: number;
  deliveryRevenue: number;
  deliveryCount: number;
  grossSales: number;
  totalDiscounts: number;
  totalRefunds: number;
  netRevenue: number;
  costLines: IncomeStatementLine[];
  totalCostOfPurchases: number;
  grossProfit: number;
  /** null when netRevenue is 0 — a margin isn't meaningful with no revenue. */
  grossMarginPct: number | null;
  totalExpenses: number;
  expenseItems: Expense[];
  operatingResult: number;
  /**
   * Units moved in/out via the Transfer Stock feature this period (not
   * pesos — transfers are zero-cost). Shown as a memo under Cost of
   * Purchases so a branch that only received transferred stock doesn't
   * read as "free inventory," and so margin can be footnoted rather than
   * silently distorted (a branch that received stock at zero cost shows
   * misleadingly high margin; the sending branch, misleadingly low).
   */
  transferInQty: number;
  transferOutQty: number;
  hasTransferActivity: boolean;
}

// "cylinderWithRefill"/"refill" get their established Sales Report labels;
// any other saleSection/purchaseSection is a category key (see safe-category-change).
const sectionLabel = (section: string): string => {
  if (section === "cylinderWithRefill") return "Full Cylinder";
  if (section === "refill") return "Refill";
  return titleCaseCategory(section);
};

function groupByLine<T>(
  items: T[],
  sectionOf: (item: T) => string,
  amountOf: (item: T) => number,
): IncomeStatementLine[] {
  const bySection = new Map<string, { amount: number; count: number }>();
  for (const item of items) {
    const key = sectionOf(item) || "unknown";
    const entry = bySection.get(key) || { amount: 0, count: 0 };
    entry.amount += amountOf(item);
    entry.count += 1;
    bySection.set(key, entry);
  }
  return Array.from(bySection.entries())
    .map(([section, v]) => ({ label: sectionLabel(section), amount: v.amount, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function computeIncomeStatement({
  saleTransactions = [],
  swaps = [],
  refunds = [],
  purchases = [],
  expenses = [],
}: IncomeStatementInput): IncomeStatementResult {
  const revenueLines = groupByLine(
    saleTransactions,
    (t) => t.saleSection,
    (t) => (t.srp || 0) * (t.quantity || 1),
  );

  const swapRevenue = swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const swapCount = swaps.length;

  const deliverySales = saleTransactions.filter((t) => (t.deliveryCharge || 0) > 0);
  const deliveryRevenue = deliverySales.reduce((sum, t) => sum + (t.deliveryCharge || 0), 0);
  const deliveryCount = deliverySales.length;

  const grossSales = revenueLines.reduce((sum, l) => sum + l.amount, 0) + swapRevenue;
  const totalDiscounts = saleTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
  const totalRefunds = refunds.reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const netRevenue = grossSales + deliveryRevenue - totalDiscounts - totalRefunds;

  // Inter-branch transfers are recorded in this same collection (see
  // recordTransfer in usePurchasesData.ts) at zero cost, purely to move the
  // PURCHASES/END inventory number between outlets. They must not appear as
  // "purchases" here — a branch whose only activity in a section was a
  // transfer would otherwise render as "4 purchases — ₱0.00," reading as
  // free stock.
  const realPurchases = purchases.filter((p) => !p.isTransfer);
  const transferPurchases = purchases.filter((p) => p.isTransfer);

  const costLines = groupByLine(
    realPurchases,
    (p) => p.purchaseSection,
    (p) => p.totalCost || 0,
  );
  const totalCostOfPurchases = costLines.reduce((sum, l) => sum + l.amount, 0);

  const transferInQty = transferPurchases
    .filter((p) => (p.quantity || 0) > 0)
    .reduce((sum, p) => sum + (p.quantity || 0), 0);
  const transferOutQty = transferPurchases
    .filter((p) => (p.quantity || 0) < 0)
    .reduce((sum, p) => sum + Math.abs(p.quantity || 0), 0);
  const hasTransferActivity = transferInQty > 0 || transferOutQty > 0;

  const grossProfit = netRevenue - totalCostOfPurchases;
  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : null;

  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const operatingResult = grossProfit - totalExpenses;

  return {
    revenueLines,
    swapRevenue,
    swapCount,
    deliveryRevenue,
    deliveryCount,
    grossSales,
    totalDiscounts,
    totalRefunds,
    netRevenue,
    costLines,
    totalCostOfPurchases,
    grossProfit,
    grossMarginPct,
    totalExpenses,
    expenseItems: expenses,
    operatingResult,
    transferInQty,
    transferOutQty,
    hasTransferActivity,
  };
}

// Splits a branch-tagged collection into per-branch buckets, plus anything
// with a missing/unrecognized branch value. Used to compute per-outlet
// Income Statements from a single unfiltered range fetch — filtering via
// `where("branch","==",b)` at the query level would silently drop any doc
// with a bad/missing branch from every total, breaking the invariant that
// PILI + CADLAN + Unassigned must equal the combined figure exactly.
export function partitionByBranch<T extends { branch?: string }>(
  items: T[],
  branchIds: string[],
): { byBranch: Record<string, T[]>; unassigned: T[] } {
  const byBranch: Record<string, T[]> = {};
  branchIds.forEach((id) => { byBranch[id] = []; });
  const unassigned: T[] = [];
  for (const item of items) {
    if (item.branch && byBranch[item.branch]) byBranch[item.branch].push(item);
    else unassigned.push(item);
  }
  return { byBranch, unassigned };
}

export interface IncomeStatementWorkbookBranchResult {
  /** Display name for the column header, e.g. "PILI". */
  label: string;
  result: IncomeStatementResult;
}

export interface IncomeStatementWorkbookInput {
  startDate: string;
  endDate: string;
  /** One entry per outlet — becomes one column each, in order. */
  branchResults: IncomeStatementWorkbookBranchResult[];
  /** Company-wide total — becomes the final "Combined" column. */
  combinedResult: IncomeStatementResult;
}

function unionLabels(lineArrays: IncomeStatementLine[][]): string[] {
  const set = new Set<string>();
  lineArrays.forEach((lines) => lines.forEach((l) => set.add(l.label)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function amountFor(lines: IncomeStatementLine[], label: string): number {
  return lines.find((l) => l.label === label)?.amount || 0;
}

// One sheet, one column per outlet plus a final Combined column — not one
// sheet per outlet, since cross-checking totals across separate sheet tabs
// is exactly where "PILI + CADLAN = Combined" would go unnoticed if it broke.
export function buildIncomeStatementWorkbook({
  startDate,
  endDate,
  branchResults,
  combinedResult,
}: IncomeStatementWorkbookInput): XLSX.WorkBook {
  const boldSz = (sz: number): Record<string, unknown> => ({ font: { bold: true, sz } });
  const sectionHeader: Record<string, unknown> = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
  const tableHeader: Record<string, unknown> = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
  const totalRowStyle: Record<string, unknown> = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };
  const numFmt = "#,##0.00";

  const allResults = [...branchResults.map((b) => b.result), combinedResult];
  const columnLabels = [...branchResults.map((b) => b.label), "Combined"];
  const lastCol = columnLabels.length; // column index of the last data column

  const sectionRows: number[] = [];
  const tableHeaderRows: number[] = [];
  const totalRows: number[] = [];

  const data: unknown[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let r: number;

  const amountsFor = (getter: (res: IncomeStatementResult) => number): number[] =>
    allResults.map(getter);

  data.push(["INCOME STATEMENT"]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });
  data.push([`Period: ${startDate} to ${endDate}`]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  data.push([]);

  r = data.length;
  data.push(["REVENUE"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["", ...columnLabels]);
  tableHeaderRows.push(r);
  const revenueLabels = unionLabels(allResults.map((res) => res.revenueLines));
  revenueLabels.forEach((label) => {
    data.push([label, ...allResults.map((res) => amountFor(res.revenueLines, label))]);
  });
  data.push(["Swap Fees", ...amountsFor((res) => res.swapRevenue)]);
  r = data.length;
  data.push(["Gross Sales", ...amountsFor((res) => res.grossSales)]);
  totalRows.push(r);
  data.push(["Delivery Charge", ...amountsFor((res) => res.deliveryRevenue)]);
  data.push(["Less: Discounts", ...amountsFor((res) => (res.totalDiscounts > 0 ? -res.totalDiscounts : 0))]);
  data.push(["Less: Refunds", ...amountsFor((res) => (res.totalRefunds > 0 ? -res.totalRefunds : 0))]);
  r = data.length;
  data.push(["Net Revenue", ...amountsFor((res) => res.netRevenue)]);
  totalRows.push(r);
  data.push([]);

  r = data.length;
  data.push(["COST OF PURCHASES"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["", ...columnLabels]);
  tableHeaderRows.push(r);
  const costLabels = unionLabels(allResults.map((res) => res.costLines));
  if (costLabels.length > 0) {
    costLabels.forEach((label) => {
      data.push([label, ...allResults.map((res) => amountFor(res.costLines, label))]);
    });
  } else {
    data.push(["No purchases recorded.", ...columnLabels.map(() => "")]);
  }
  r = data.length;
  data.push(["Total Cost of Purchases", ...amountsFor((res) => res.totalCostOfPurchases)]);
  totalRows.push(r);
  // Memo only — units, not pesos, and only meaningful per-outlet (nets to
  // zero company-wide, so Combined always reads 0/0 here by design).
  if (allResults.some((res) => res.hasTransferActivity)) {
    data.push(["  Stock transferred in (units, not valued)", ...amountsFor((res) => res.transferInQty)]);
    data.push(["  Stock transferred out (units, not valued)", ...amountsFor((res) => res.transferOutQty)]);
  }
  data.push([]);

  r = data.length;
  data.push(["Gross Profit", ...amountsFor((res) => res.grossProfit)]);
  totalRows.push(r);
  data.push([
    "Gross Margin %",
    ...allResults.map((res) => {
      if (res.grossMarginPct === null) return "—";
      return `${res.grossMarginPct.toFixed(1)}%${res.hasTransferActivity ? "*" : ""}`;
    }),
  ]);
  if (allResults.some((res) => res.hasTransferActivity)) {
    data.push(["  * includes zero-cost transferred stock — margin may not reflect true cost"]);
  }
  data.push([]);

  r = data.length;
  data.push(["EXPENSES"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["", ...columnLabels]);
  tableHeaderRows.push(r);
  r = data.length;
  data.push(["Total Expenses", ...amountsFor((res) => res.totalExpenses)]);
  totalRows.push(r);
  data.push([]);

  r = data.length;
  data.push(["Operating Result (before shared costs)", ...amountsFor((res) => res.operatingResult)]);
  totalRows.push(r);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 40 }, ...columnLabels.map(() => ({ wch: 16 }))];

  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      if (R === 0) ws[addr].s = boldSz(16);
      else if (R === 1) ws[addr].s = boldSz(12);
      else if (sectionRows.includes(R)) ws[addr].s = sectionHeader;
      else if (tableHeaderRows.includes(R)) ws[addr].s = tableHeader;
      else if (totalRows.includes(R)) {
        ws[addr].s = { ...totalRowStyle };
        if (typeof ws[addr].v === "number") ws[addr].s.numFmt = numFmt;
      } else if (typeof ws[addr].v === "number") {
        ws[addr].s = { numFmt };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
  return wb;
}

// Builds and downloads the Income Statement workbook for the selected period.
export function exportIncomeStatementWorkbook(input: IncomeStatementWorkbookInput): void {
  const wb = buildIncomeStatementWorkbook(input);
  XLSX.writeFile(wb, `Income_Statement_${input.startDate}_to_${input.endDate}.xlsx`);
}
