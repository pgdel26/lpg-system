import * as XLSX from "xlsx-js-style";
import { titleCaseCategory } from "../utils";
import { customerKey } from "../customers";
import { paymentSplit } from "../payments";
import { collectionEventsInRange } from "../receivables";
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
  /**
   * The UNBOUNDED, live AR doc list (e.g. useReceivablesData's
   * `arTransactions`) — NOT a date-ranged fetch. An invoice sold last month
   * can be collected this month, so collections-in-range must be derived
   * from every AR doc regardless of the doc's own sale date, then filtered
   * by each event's own date.
   */
  arTransactions?: SaleTransaction[];
  /** Needed alongside arTransactions to bound collections to this period. */
  startDate?: string;
  endDate?: string;
  /**
   * Attributes collections to where the cash was physically received (event
   * branch), not the invoice's origin branch — same rule as
   * lib/receivables.ts's collectionEventsOnDate. Omit for company-wide.
   */
  branch?: string;
}

export interface IncomeStatementResult {
  revenueLines: IncomeStatementLine[];
  swapRevenue: number;
  swapCount: number;
  deliveryRevenue: number;
  deliveryCount: number;
  /**
   * Product revenue only (sum of revenueLines) — deliberately excludes
   * swapRevenue, unlike this app's other "Gross Sales" figures (e.g. the
   * Sales Report tab's), so that grossSales + deliveryRevenue −
   * totalDiscounts equals totalBilled exactly (swap fees have no payment
   * channel — they're not billed to a customer through a sale doc — so
   * folding them in here would break that identity). Swap fees still
   * contribute to netRevenue, just added there explicitly instead.
   */
  grossSales: number;
  totalDiscounts: number;
  totalRefunds: number;
  netRevenue: number;
  /** One line per customer with a nonzero discount this period, sorted by amount desc. */
  discountsByCustomer: IncomeStatementLine[];
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

  // ---- Payment-channel / cash-position figures ----
  // These are period cash MOVEMENTS, not a running balance — this app has no
  // opening-balance concept, so there is no "cash on hand at period end" to
  // compute, only "cash generated this period." See netCashMovement.

  /** How this period's SALES were billed — sums to totalBilled, not netRevenue (which also adds swap fees and subtracts refunds). */
  salesCash: number;
  salesGcash: number;
  salesAr: number;
  /**
   * salesCash + salesGcash + salesAr === grossSales + deliveryRevenue −
   * totalDiscounts exactly (grossSales here is product revenue only — see
   * its own comment) for every doc recordSale writes (payments are
   * validated to the centavo at write time — see useSalesData.ts). A legacy
   * doc missing `totalAmount` falls back to paymentSplit()'s per-unit
   * `finalPrice`, so the identity isn't unconditional for pre-multi-payment
   * historical data.
   */
  totalBilled: number;

  /** AR collected THIS period (any invoice date), split by how it was collected. Check collections are money not yet cash — memo only, excluded from netCashMovement. */
  arCollectedCash: number;
  arCollectedGcash: number;
  arCollectedCheck: number;

  /**
   * Net cash generated this period: salesCash + swapRevenue (assumed cash)
   * + arCollectedCash − totalRefunds − totalExpenses − totalCostOfPurchases
   * (totalCostOfPurchases excludes isTransfer docs — see realPurchases).
   * Purchases are paid COD (confirmed business practice, not an assumption —
   * if that ever changes, add a paymentMethod field to Purchase and subtract
   * only cash-tagged docs). This is DIFFERENT from — and, once purchases
   * were included, permanently diverges from — the Sales Report's per-day
   * Expected Cash Remit, which deliberately excludes purchases (that figure
   * reconciles against the physically-counted drawer, a different workflow).
   * Do not "fix" that divergence by touching salesReport.ts's
   * expectedCashRemit; see cashBuildUp for the other reason these two can
   * differ.
   */
  netCashMovement: number;
  /**
   * The on-screen/Excel cash walk's build-up: operatingResult − salesGcash
   * − salesAr + arCollectedCash. Equals netCashMovement exactly ONLY when
   * totalBilled's identity holds for every doc in range (see totalBilled) —
   * computed once here (not duplicated in the component and the workbook
   * builder) so both surfaces read the same number instead of risking drift.
   */
  cashBuildUp: number;
  /** netCashMovement − cashBuildUp. Nonzero only when a legacy doc breaks the totalBilled identity — see cashBuildUp. Surfaced on screen/Excel as a reconciliation note rather than left as a silent non-footing gap. */
  cashReconciliationGap: number;
}

// "cylinderWithRefill"/"refill" get their established Sales Report labels;
// any other saleSection/purchaseSection is a category key (see safe-category-change).
const sectionLabel = (section: string): string => {
  if (section === "cylinderWithRefill") return "Full Cylinder";
  if (section === "refill") return "Refill";
  return titleCaseCategory(section);
};

// Shared per-customer roll-up behind every itemized breakdown row in the Sales
// Report's Daily Breakdown. `amountOf` picks which peso figure is being
// itemized; sales contributing 0 are skipped, so a pure-cash sale never appears
// in the A/R or GCash list and an undiscounted one never appears under
// Discounts. Grouped by customerKey() (not raw name) so casing/whitespace
// variants of one person don't split into separate rows — same identity rule as
// useCustomersData/TopDebtorsChart. The display label keeps the first-seen name
// variant, not the normalized key.
export function groupSalesByCustomer(
  saleTransactions: SaleTransaction[],
  amountOf: (t: SaleTransaction) => number,
): IncomeStatementLine[] {
  const byCustomer = new Map<string, { name: string; amount: number; count: number }>();
  for (const t of saleTransactions) {
    const amount = amountOf(t);
    if (!amount) continue;
    const key = customerKey(t.customerName || "Unknown");
    const entry = byCustomer.get(key) || { name: t.customerName || "Unknown", amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    byCustomer.set(key, entry);
  }
  return Array.from(byCustomer.values())
    .map((v) => ({ label: v.name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);
}

export function groupDiscountsByCustomer(saleTransactions: SaleTransaction[]): IncomeStatementLine[] {
  return groupSalesByCustomer(saleTransactions, (t) => t.discount || 0);
}

// A/R and GCash both go through paymentSplit() rather than reading paymentType,
// so a split-payment sale contributes its actual per-channel portions to each
// list instead of landing wholly in one. Same rule as the row totals above them.
export function groupARByCustomer(saleTransactions: SaleTransaction[]): IncomeStatementLine[] {
  return groupSalesByCustomer(saleTransactions, (t) => paymentSplit(t).ar);
}

export function groupGCashByCustomer(saleTransactions: SaleTransaction[]): IncomeStatementLine[] {
  return groupSalesByCustomer(saleTransactions, (t) => paymentSplit(t).gcash);
}

// Revenue lines follow a fixed business-preferred order rather than
// alphabetical — everything else (any other product category, e.g. other
// cylinder brands) sorts after these three, alphabetically among themselves.
// Used by the Excel export's per-category revenue rows (the on-screen
// breakdown shows Gross Sales as a single total, not a per-category
// breakdown). Derived from sectionLabel() (not hardcoded display strings) so
// a section-key rename can't silently degrade this to alphabetical order
// without also changing this line.
const REVENUE_LABEL_PRIORITY = ["refill", "cylinderWithRefill", "accessories"].map(sectionLabel);
function compareRevenueLabels(a: string, b: string): number {
  const ai = REVENUE_LABEL_PRIORITY.indexOf(a);
  const bi = REVENUE_LABEL_PRIORITY.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? REVENUE_LABEL_PRIORITY.length : ai) - (bi === -1 ? REVENUE_LABEL_PRIORITY.length : bi);
  return a.localeCompare(b);
}
function sortRevenueLines(lines: IncomeStatementLine[]): IncomeStatementLine[] {
  return [...lines].sort((a, b) => compareRevenueLabels(a.label, b.label));
}

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
  arTransactions = [],
  startDate,
  endDate,
  branch,
}: IncomeStatementInput): IncomeStatementResult {
  const revenueLines = sortRevenueLines(groupByLine(
    saleTransactions,
    (t) => t.saleSection,
    (t) => (t.srp || 0) * (t.quantity || 1),
  ));

  const swapRevenue = swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const swapCount = swaps.length;

  const deliverySales = saleTransactions.filter((t) => (t.deliveryCharge || 0) > 0);
  const deliveryRevenue = deliverySales.reduce((sum, t) => sum + (t.deliveryCharge || 0), 0);
  const deliveryCount = deliverySales.length;

  // Product revenue only — see the field comment on why swapRevenue is
  // deliberately excluded here and added back in below for netRevenue.
  const grossSales = revenueLines.reduce((sum, l) => sum + l.amount, 0);
  const totalDiscounts = saleTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
  const discountsByCustomer = groupDiscountsByCustomer(saleTransactions);
  const totalRefunds = refunds.reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const netRevenue = grossSales + swapRevenue + deliveryRevenue - totalDiscounts - totalRefunds;

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

  // How this period's sales were billed — foots to totalBilled, a DIFFERENT
  // figure from netRevenue (which also folds in swaps and subtracts refunds).
  // Single pass over saleTransactions (was three separate reduces, each
  // re-running paymentSplit on every doc).
  const paymentTotals = saleTransactions.reduce((acc, t) => {
    const split = paymentSplit(t);
    acc.cash += split.cash;
    acc.gcash += split.gcash;
    acc.ar += split.ar;
    return acc;
  }, { cash: 0, gcash: 0, ar: 0 });
  const salesCash = paymentTotals.cash;
  const salesGcash = paymentTotals.gcash;
  const salesAr = paymentTotals.ar;
  const totalBilled = salesCash + salesGcash + salesAr;

  // AR collected THIS period, from any invoice regardless of when it was
  // sold — collectionEventsInRange takes the unbounded arTransactions list
  // (not the date-ranged saleTransactions) for exactly that reason.
  const collectionsThisPeriod = startDate && endDate
    ? collectionEventsInRange(arTransactions, startDate, endDate, branch)
    : [];
  const collectedTotal = collectionsThisPeriod.reduce((sum, { event }) => sum + (event.amount || 0), 0);
  const sumByMethod = (method: string): number =>
    collectionsThisPeriod.filter(({ event }) => event.method === method).reduce((sum, { event }) => sum + (event.amount || 0), 0);
  const arCollectedGcash = sumByMethod("gcash");
  const arCollectedCheck = sumByMethod("check");
  // Derived as the remainder rather than sumByMethod("cash") — a collection
  // event with a missing/unrecognized method (the type allows any string)
  // must still count as cash, matching how collectionMethodLabel/arStatus
  // elsewhere in the codebase treat anything non-gcash/non-check as cash.
  // Summing only exact "cash" matches would silently drop such an event from
  // both this figure AND netCashMovement, with no reconciliation-gap warning
  // (both derive from arCollectedCash, so they'd stay consistent with each
  // other while both quietly under-counting).
  const arCollectedCash = collectedTotal - arCollectedGcash - arCollectedCheck;

  // Includes totalCostOfPurchases — purchases are paid COD (confirmed
  // business practice), so treating the full cost as a cash outflow here is
  // accurate, not an assumption (see the field comment on netCashMovement).
  const netCashMovement = salesCash + swapRevenue + arCollectedCash - totalRefunds - totalExpenses - totalCostOfPurchases;

  // The on-screen/Excel cash walk (Operating Result − GCash − A/R + A/R
  // Collected in Cash) only equals netCashMovement exactly when totalBilled's
  // identity holds for every doc in range (see totalBilled's comment) — a
  // legacy doc missing totalAmount can create a gap. Computed once here, not
  // duplicated in the component and the workbook builder, so the two can't
  // drift out of sync with each other.
  const cashBuildUp = operatingResult - salesGcash - salesAr + arCollectedCash;
  const cashReconciliationGap = netCashMovement - cashBuildUp;

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
    discountsByCustomer,
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
    salesCash,
    salesGcash,
    salesAr,
    totalBilled,
    arCollectedCash,
    arCollectedGcash,
    arCollectedCheck,
    netCashMovement,
    cashBuildUp,
    cashReconciliationGap,
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
  const revenueLabels = unionLabels(allResults.map((res) => res.revenueLines)).sort(compareRevenueLabels);
  revenueLabels.forEach((label) => {
    data.push([label, ...allResults.map((res) => amountFor(res.revenueLines, label))]);
  });
  r = data.length;
  data.push(["Gross Sales", ...amountsFor((res) => res.grossSales)]);
  totalRows.push(r);
  data.push(["Delivery Charge", ...amountsFor((res) => res.deliveryRevenue)]);
  data.push(["Less: Discounts", ...amountsFor((res) => (res.totalDiscounts > 0 ? -res.totalDiscounts : 0))]);
  data.push(["Less: Refunds", ...amountsFor((res) => (res.totalRefunds > 0 ? -res.totalRefunds : 0))]);
  data.push(["Swap Fees", ...amountsFor((res) => res.swapRevenue)]);
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
  data.push(["  Stock bought this period, not adjusted for opening/closing inventory — a heavy-restocking month looks worse than it was, a sell-down month looks better"]);
  // Memo only — units, not pesos, and only meaningful per-outlet (nets to
  // zero company-wide, so Combined always reads 0/0 here by design).
  if (allResults.some((res) => res.hasTransferActivity)) {
    data.push(["  Stock transferred in (units, not valued)", ...amountsFor((res) => res.transferInQty)]);
    data.push(["  Stock transferred out (units, not valued)", ...amountsFor((res) => res.transferOutQty)]);
    data.push(["  Transferred stock is zero-cost here — the receiving outlet's Gross Profit is overstated, the sending outlet's understated, by the transferred amount"]);
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
  data.push([]);

  // ---- Cash position — a separate appendix, not part of the accrual
  // statement above. These rows do NOT foot to Net Revenue or Gross
  // Profit — see the field comments in IncomeStatementResult. Starts from
  // Operating Result rather than rebuilding from Total Billed — Operating
  // Result already nets out Cost of Purchases (paid COD), Refunds, and
  // Expenses, so nothing here re-subtracts them. All that's left to adjust
  // for is revenue that wasn't billed as cash (GCash, A/R), then A/R
  // actually collected in cash this period. GCash and A/R are explicitly
  // subtracted (mirroring the on-screen layout) rather than just never
  // added, since GCash is reconciled by a separate account and this section
  // exists specifically to answer "how much is in cash, only."
  r = data.length;
  data.push(["CASH POSITION THIS PERIOD"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["Cash movements only, not a running balance. Starts from Operating Result, which already nets out Cost of Purchases (paid COD), Refunds and Expenses. Assumes swap fees and expenses are settled in cash."]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["", ...columnLabels]);
  tableHeaderRows.push(r);
  data.push(["Operating Result", ...amountsFor((res) => res.operatingResult)]);
  data.push(["Less: GCash", ...amountsFor((res) => (res.salesGcash > 0 ? -res.salesGcash : 0))]);
  data.push(["Less: A/R (credit sales)", ...amountsFor((res) => (res.salesAr > 0 ? -res.salesAr : 0))]);
  // A/R collected this period — always its own line (how much came back in
  // on credit sales this month), broken out by channel so GCash/check
  // collections are subtracted back out BEFORE the final cash total, instead
  // of appearing in a memo section after it.
  const hasArChannelSplit = allResults.some((res) => res.arCollectedGcash > 0 || res.arCollectedCheck > 0);
  data.push(["+ A/R Collected This Period", ...amountsFor((res) => res.arCollectedCash + res.arCollectedGcash + res.arCollectedCheck)]);
  if (hasArChannelSplit) {
    if (allResults.some((res) => res.arCollectedGcash > 0)) {
      data.push(["  Less: collected via GCash", ...amountsFor((res) => (res.arCollectedGcash > 0 ? -res.arCollectedGcash : 0))]);
    }
    if (allResults.some((res) => res.arCollectedCheck > 0)) {
      data.push(["  Less: collected by check (to deposit, not in drawer)", ...amountsFor((res) => (res.arCollectedCheck > 0 ? -res.arCollectedCheck : 0))]);
    }
    // Only shown when there's an actual channel split to resolve — otherwise
    // this would be the exact same figure as "+ A/R Collected This Period"
    // one row up, reading as a duplicate rather than a subtotal.
    r = data.length;
    data.push(["A/R Collected in Cash", ...amountsFor((res) => res.arCollectedCash)]);
    totalRows.push(r);
  }
  r = data.length;
  data.push(["NET CASH MOVEMENT THIS PERIOD", ...amountsFor((res) => res.netCashMovement)]);
  totalRows.push(r);
  data.push(["  Physical cash only, from this period's activity — GCash and checks not included"]);
  data.push(["  Net of stock purchases (paid COD) — differs from the Sales Report's Expected Cash Remit, which excludes purchases"]);
  if (branchResults.length > 0) {
    data.push(["  Per-outlet columns: purchases are paid from shared profit across outlets, not each outlet's own till — only the Combined column is a reliable cash figure"]);
  }
  // cashReconciliationGap is computed once in computeIncomeStatement (not
  // duplicated here) — nonzero only when a legacy doc breaks the totalBilled
  // identity (see its field comment). Surface it rather than let the
  // workbook silently not foot.
  if (allResults.some((res) => Math.abs(res.cashReconciliationGap) > 0.01)) {
    data.push(["  Rows above may not sum exactly to the total — a small number of older sales records predate this app's full payment breakdown per sale", ...amountsFor((res) => res.cashReconciliationGap)]);
  }

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
