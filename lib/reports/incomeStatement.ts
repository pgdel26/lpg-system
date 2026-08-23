import * as XLSX from "xlsx-js-style";
import { saleSectionLabel } from "../utils";
import { customerKey } from "../customers";
import { paymentSplit } from "../payments";
import { collectionEventsInRange, arMethodLabel } from "../receivables";
import type { SaleTransaction, Swap, Refund, Purchase, Expense, PurchaseDelivery } from "../types";
import { purchaseCost } from "./purchaseCost";

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
  /** purchaseDelivery docs. Cost is recorded per day now, not per line — see
   *  lib/reports/purchaseCost.ts for the rule that spans both eras. */
  purchaseDeliveries?: PurchaseDelivery[];
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
  /** Deliveries in this period whose cost nobody has entered yet. Above 0 means
   *  totalCostOfPurchases is a floor, not the real spend, and Gross Profit is
   *  overstated by whatever those deliveries actually cost — so every surface
   *  showing the cost must say so rather than presenting the figure as complete. */
  uncostedDeliveryCount: number;
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
  /**
   * totalBilled − (grossSales + deliveryRevenue − totalDiscounts): the payments
   * side measured against the revenue side. Zero for everything recordSale
   * writes, which validates the two to the centavo before saving.
   *
   * Kept because netCashMovement's meaning depends on this identity, and the
   * redefinition made a break here WORSE than it used to be. paymentSplit's
   * legacy fallback is `totalAmount || finalPrice`, and finalPrice is per unit —
   * so a legacy A/R doc with no totalAmount and qty 3 contributes 3 units to
   * grossSales while salesAr backs out only 1, and netCashMovement counts the
   * remainder as money nobody paid. Under the old physical-cash definition the
   * same doc contributed zero error.
   *
   * Measured 2026-08-20: 5 docs across all history, worth ₱9.00 net in August
   * and ₱0 in July. Surfaced under Total Billed (not under Net Cash Movement,
   * which would wrongly imply the walk fails to foot) whenever it is nonzero.
   */
  billingIdentityGap: number;

  /** AR collected THIS period (any invoice date), split by how it was collected.
   *  All three are included in netCashMovement: a check is encashed into the
   *  business's bank, so it is money received rather than money pending. */
  arCollectedCash: number;
  arCollectedGcash: number;
  arCollectedCheck: number;
  /** arCollectedCash + arCollectedGcash + arCollectedCheck. */
  arCollectedTotal: number;

  /**
   * operatingResult − salesAr + arCollectedTotal.
   *
   * The accrual-to-cash bridge: back out credit sales BILLED this period (no
   * money arrived), then add everything COLLECTED on invoices (money did
   * arrive, whenever the invoice was raised). Expanding it via totalBilled's
   * identity gives what it is meant to be —
   *
   *   salesCash + salesGcash + swapRevenue + arCollectedTotal
   *     − totalRefunds − totalCostOfPurchases − totalExpenses
   *
   * — i.e. everything received minus everything paid, with no credit sale
   * counted as money until collected.
   *
   * That expansion is CONDITIONAL on totalBilled's identity holding, which it
   * does for everything recordSale writes but not for a handful of legacy docs
   * (see totalBilled's own comment). Measured 2026-08-20: 5 docs across all
   * history break it, four because `totalAmount` omits their deliveryCharge and
   * one from a ₱9 entry inconsistency. Net effect on any period figure is under
   * ₱25, and the on-screen walk still foots exactly either way because it IS
   * this definition — the discrepancy is between this figure and a
   * from-scratch cash tally, not between the rows and their total.
   *
   * "Received" here means received by the BUSINESS, not by the till: GCash
   * (its own wallet account) and checks (encashed to the bank) both count. On
   * real data that distinction is the whole ballgame — check was 99.5% of
   * August 2026's A/R collections, so the previous physical-cash-only
   * definition discarded PHP 1,476,891 of the PHP 1,484,291 collected.
   *
   * Purchases are paid COD (confirmed practice, not an assumption — if that
   * changes, add a paymentMethod to Purchase and subtract only cash-tagged
   * docs).
   *
   * Still DIFFERENT from the Sales Report's per-day Expected Cash Remit, which
   * excludes purchases entirely and reconciles against the physically counted
   * drawer — a different workflow. Do not "fix" that divergence in
   * salesReport.ts.
   *
   * Not channel-attributable: Cost of Purchases and Expenses have no payment
   * channel, so the billing split shown beneath it foots to totalBilled and NOT
   * to this figure. Do not relabel that block as this figure's components.
   */
  netCashMovement: number;
}

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
// breakdown). Derived from saleSectionLabel() (not hardcoded display strings) so
// a section-key rename can't silently degrade this to alphabetical order
// without also changing this line.
const REVENUE_LABEL_PRIORITY = ["refill", "cylinderWithRefill", "accessories"].map(saleSectionLabel);
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
    .map(([section, v]) => ({ label: saleSectionLabel(section), amount: v.amount, count: v.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function computeIncomeStatement({
  saleTransactions = [],
  swaps = [],
  refunds = [],
  purchases = [],
  purchaseDeliveries = [],
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

  // Cost comes from purchaseCost(): a delivery's own doc, or a legacy line's own
  // totalCost. Narrow deliveries to this report's period/branch by THEIR date and
  // branch — `purchases` arrives already narrowed by the caller, so mixing a
  // scoped list with an unscoped one would over-count.
  const scopedDeliveries = (purchaseDeliveries || []).filter((d) => {
    if (startDate && d.date < startDate) return false;
    if (endDate && d.date > endDate) return false;
    if (branch !== undefined && d.branch !== branch) return false;
    return true;
  });
  const costBreakdown = purchaseCost(realPurchases, scopedDeliveries);
  const totalCostOfPurchases = costBreakdown.total;
  const uncostedDeliveryCount = costBreakdown.pendingCount;

  // Per-category cost only exists for the per-line era. A delivery costed as one
  // total contributes a single undifferentiated line — the supplier does not
  // itemize, so inventing a split would be fiction.
  const costLines: IncomeStatementLine[] = [
    ...groupByLine(
      realPurchases.filter((p) => !p.deliveryId),
      (p) => p.purchaseSection,
      (p) => p.totalCost || 0,
    ),
    ...(costBreakdown.fromDeliveries > 0
      ? [{
          label: "Purchases",
          amount: costBreakdown.fromDeliveries,
          // Costed deliveries only: captioning ₱5.2M as "20 deliveries" when 5 of
          // them contributed nothing understates the average delivery badly.
          count: costBreakdown.deliveryCount - costBreakdown.pendingCount,
        }]
      : []),
  ];

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
  // Independently derived: the payments side against the revenue side. Never
  // reconcile a money figure against a restatement of itself.
  // Rounded to the centavo: this is a float subtraction of two large sums, and an
  // unrounded 9.000000001 would trip the > 0.01 display test with noise.
  const billingIdentityGap =
    Math.round((totalBilled - (grossSales + deliveryRevenue - totalDiscounts)) * 100) / 100;

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

  const arCollectedTotal = arCollectedCash + arCollectedGcash + arCollectedCheck;

  // Operating Result already nets out Cost of Purchases (paid COD), Refunds and
  // Expenses, so nothing here re-subtracts them. The two adjustments are the
  // A/R movement: out with what was billed on credit, in with what was actually
  // collected. See the field comment for the expanded form.
  const netCashMovement = operatingResult - salesAr + arCollectedTotal;

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
    uncostedDeliveryCount,
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
    arCollectedTotal,
    billingIdentityGap,
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
  data.push(["  Stock bought this period, not adjusted for opening/closing inventory — a heavy-restocking month looks worse than it was, a sell-down month looks better"])
  // Load-bearing caveat, not decoration: without it a month of uncosted
  // deliveries exports as a complete-looking cost figure that is simply too low.
  if (allResults.some((res) => res.uncostedDeliveryCount > 0)) {
    data.push(["  Deliveries received with no cost entered yet", ...amountsFor((res) => res.uncostedDeliveryCount)]);
    data.push(["  Cost of Purchases above excludes those deliveries — it is a floor, and Gross Profit is overstated until they are costed"]);
  };
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
  // statement above. These rows do NOT foot to Net Revenue or Gross Profit.
  // Starts from Operating Result, which already nets out Cost of Purchases
  // (paid COD), Refunds and Expenses, so nothing here re-subtracts them; the
  // two adjustments are the A/R movement — credit billed out, cash collected in.
  //
  // The billing split below the total is a MEMO. It foots to Total Billed, not
  // to Net Cash Movement — purchases and expenses have no payment channel, so
  // Net Cash Movement is not channel-attributable. Kept as its own labelled
  // block with its own total for exactly that reason.
  r = data.length;
  data.push(["CASH POSITION THIS PERIOD"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["Period movements, not a running balance. Starts from Operating Result, which already nets out Cost of Purchases (paid COD), Refunds and Expenses; the two adjustments below are the A/R movement — out with credit billed, in with cash collected. Assumes swap fees and expenses are settled in cash."]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["", ...columnLabels]);
  tableHeaderRows.push(r);
  data.push(["Operating Result", ...amountsFor((res) => res.operatingResult)]);
  data.push(["+ A/R Collected This Period", ...amountsFor((res) => res.arCollectedTotal)]);
  // Channel sub-lines are informational, not adjustments — every one of them is
  // already inside the figure above, checks included.
  if (allResults.some((res) => res.arCollectedCash > 0)) {
    data.push(["  of which collected in cash", ...amountsFor((res) => res.arCollectedCash)]);
  }
  if (allResults.some((res) => res.arCollectedCheck > 0)) {
    data.push(["  of which collected by check (encashed to bank)", ...amountsFor((res) => res.arCollectedCheck)]);
  }
  if (allResults.some((res) => res.arCollectedGcash > 0)) {
    data.push([`  of which collected via ${arMethodLabel("gcash")}`, ...amountsFor((res) => res.arCollectedGcash)]);
  }
  // The other half of the A/R movement: this period's credit sales are in
  // Operating Result as revenue, but no money arrived for them.
  data.push(["Less: A/R (credit sales this period, not yet received)", ...amountsFor((res) => (res.salesAr > 0 ? -res.salesAr : 0))]);
  r = data.length;
  data.push(["NET CASH MOVEMENT THIS PERIOD", ...amountsFor((res) => res.netCashMovement)]);
  totalRows.push(r);
  data.push(["  Everything received minus everything paid: cash and GCash sales, swap fees and A/R collections, less refunds, purchases and expenses. No credit sale counts as money until collected"]);
  data.push(["  Received by the business, not by the till — GCash and encashed checks both count"]);
  data.push(["  Net of stock purchases (paid COD) — differs from the Sales Report's Expected Cash Remit, which excludes purchases"]);
  if (branchResults.length > 0) {
    data.push(["  Per-outlet columns: purchases are paid from shared profit across outlets, not each outlet's own till — only the Combined column is a reliable cash figure"]);
  }
  data.push([]);

  // Memo block: how the period's sales were billed. Foots to Total Billed by
  // construction (totalBilled === salesCash + salesGcash + salesAr), so these
  // rows always add up — unlike a channel split of Net Cash Movement, which
  // could not.
  r = data.length;
  data.push(["HOW THIS PERIOD'S SALES WERE BILLED"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["Memo. Describes this period's sales by payment channel and foots to Total Billed — NOT a breakdown of Net Cash Movement above, which includes purchases and expenses that have no payment channel."]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r = data.length;
  data.push(["", ...columnLabels]);
  tableHeaderRows.push(r);
  data.push(["Cash", ...amountsFor((res) => res.salesCash)]);
  data.push(["GCash", ...amountsFor((res) => res.salesGcash)]);
  data.push(["A/R (on credit)", ...amountsFor((res) => res.salesAr)]);
  r = data.length;
  data.push(["Total Billed", ...amountsFor((res) => res.totalBilled)]);
  totalRows.push(r);
  if (allResults.some((res) => Math.abs(res.billingIdentityGap) > 0.01)) {
    data.push(["  Does not match sales revenue by this much — a few legacy records predate the per-sale payment breakdown, and Net Cash Movement is off by the same amount", ...amountsFor((res) => res.billingIdentityGap)]);
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
