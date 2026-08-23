import { netBilled } from "./billed";
import { arStatus, collectionEventsInRange, arMethodLabel } from "../receivables";
import { customerKey } from "../customers";
import { expenseDisplayLabel } from "../expenses";
import type {
  Branch, SaleTransaction, Swap, Refund, Expense, Staff, InventoryCell,
} from "../types";

// ---------------------------------------------------------------------------
// Dashboard aggregation — pure. No Firestore; the fetches live in
// lib/hooks/useDashboardData.ts.
//
// Sales money here is "net billed revenue" per ./billed.ts, which equals the
// Income Statement's netRevenue and is BEFORE expenses. It is not the Sales
// Report's remit figure. Anything rendering these numbers must say so.
// ---------------------------------------------------------------------------

/** The inventory section holding sellable full cylinders (see buildInventorySections). */
export const FULL_SECTION = "full";

/** Under this many days of cover a product is critical. */
const LOW_DAYS = 2;
/** Under this many days of cover it's worth watching. */
const WATCH_DAYS = 4;
/** Window used to measure how fast a product actually sells. */
export const VELOCITY_DAYS = 30;

// ---------------------------------------------------------------------------
// Date helpers — string space only, so no browser timezone can shift a day.
// ---------------------------------------------------------------------------

/** Shift a "YYYY-MM-DD" by whole days. */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  // Date.UTC + getUTC* keeps this off the local calendar entirely; the numbers
  // go in and come out as UTC, so the result is pure arithmetic on the string.
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardInput {
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  expenses: Expense[];
  /**
   * Needed to name a salary expense: the staff member's name is resolved at
   * READ time, never copied into the expense record, so a rename shows up in
   * history rather than leaving a stale name behind.
   */
  staff: Staff[];
  /**
   * The UNBOUNDED A/R list from the provider, not a date-ranged fetch: an
   * invoice sold last month can be collected today, and a range query on the
   * sale's own `date` would never see that collection.
   */
  arTransactions: SaleTransaction[];
  /** The day the dashboard is reporting on. */
  date: string;
  branches: Branch[];
  /** branch id -> product -> the `full` section's cell for `date`. */
  onHandByBranch: Record<string, Record<string, InventoryCell>>;
  /** Cylinder product names, in display order. */
  cylinderProducts: string[];
}

export interface OutletSplitRow {
  branchId: string;
  name: string;
  netSales: number;
  /** 0-1, share of the day's total. 0 when the day total is 0. */
  share: number;
}

export type StockLevel = "out" | "low" | "watch";

export interface LowStockRow {
  key: string;
  product: string;
  branchId: string;
  branchName: string;
  onHand: number;
  /** Average units sold per day over VELOCITY_DAYS. */
  perDay: number;
  /** onHand / perDay. null when perDay is 0 (nothing to divide by). */
  daysOfCover: number | null;
  level: StockLevel;
}

export type FeedKind = "sale" | "swap" | "refund" | "collection";

export interface FeedRow {
  key: string;
  kind: FeedKind;
  /** Invoice or reference for the REF column; "—" when there isn't one. */
  ref: string;
  branchId: string;
  branchName: string;
  description: string;
  amount: number;
  /** Epoch ms, for sorting and time display. */
  at: number;
}

export interface ExpenseEntry {
  key: string;
  description: string;
  amount: number;
}

export interface ArAccount {
  name: string;
  amount: number;
}

export interface PendingArSummary {
  total: number;
  openCount: number;
  /**
   * Every account with something outstanding, largest first. The full list, not
   * a top-N: how many to show is the card's decision, and a report or export
   * would want a different number than a dashboard tile does.
   */
  accounts: ArAccount[];
}

export interface DashboardSummary {
  netSales: number;
  outletSplit: OutletSplitRow[];
  expensesTotal: number;
  /**
   * The day's expenses, largest first — the full list, not a top-N, for the
   * same reason as PendingArSummary.accounts: how many to show is the card's
   * call. `expenses.length` is the entry count.
   */
  expenses: ExpenseEntry[];
  lowStock: LowStockRow[];
  /**
   * Names of outlets with NO inventory recorded for `date`. Their products are
   * excluded from lowStock entirely: absent data is not the same as zero stock,
   * and treating it as zero would flag every product at that outlet as OUT. The
   * card names them instead, so the gap is visible rather than being silently
   * reported as either a problem or an all-clear.
   */
  outletsMissingInventory: string[];
  feed: FeedRow[];
}

// ---------------------------------------------------------------------------

const onDate = <T extends { date?: string }>(docs: T[], date: string): T[] =>
  docs.filter((d) => d.date === date);

const inBranch = <T extends { branch?: string }>(docs: T[], branchId: string): T[] =>
  docs.filter((d) => d.branch === branchId);

/** Epoch ms from a Firestore Timestamp-ish value, falling back to the date. */
function timeOf(createdAt: unknown, date: string): number {
  const ts = createdAt as { toDate?: () => Date; seconds?: number } | null | undefined;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  return new Date(`${date}T00:00:00`).getTime();
}

/**
 * On-hand for a product at a branch. Uses AUDIT when one was recorded, else the
 * arithmetic END — the same precedence as the next day's BEG, because an audit
 * IS the correction (the app never auto-reconciles the difference).
 *
 * Returns null for "unknown", which is NOT the same as 0. A product with no
 * cell (or a cell carrying neither a count nor an audit) has simply never been
 * counted at that outlet — reporting it as OUT would fill the card with alerts
 * for products the outlet doesn't even carry. Only an explicit 0 is a real
 * zero. This is the same absent-vs-zero rule the inventory screen already uses
 * for BEG, where an absent cell is undefined and a recorded 0 renders as "0".
 */
function onHandFor(cell: InventoryCell | undefined): number | null {
  if (!cell) return null;
  // `aud` is typed number | FieldValue since it can be a deleteField() sentinel
  // on the way out; only a real number counts as an audited count here.
  if (typeof cell.aud === "number") return cell.aud;
  if (typeof cell.end === "number") return cell.end;
  return null;
}

export function buildDashboardSummary({
  saleTransactions,
  swaps,
  refunds,
  expenses,
  staff,
  arTransactions,
  date,
  branches,
  onHandByBranch,
  cylinderProducts,
}: DashboardInput): DashboardSummary {
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id;

  // ---- Headline --------------------------------------------------------
  // Deliberately no day-over-day comparison. Against the CURRENT day it pits a
  // part-finished day against a complete one, which reads as a collapse in the
  // morning and a boom by closing time no matter how trade actually went. A
  // comparison is only honest between two FINISHED days; if that's wanted later
  // it belongs behind an explicit "complete days only" rule, not here.
  const netSales = netBilled(onDate(saleTransactions, date), onDate(swaps, date), onDate(refunds, date));

  // ---- Outlet split (rendered inside the Net Sales card) -----------------
  const splitRaw = branches.map((b) => ({
    branchId: b.id,
    name: b.name,
    netSales: netBilled(
      onDate(inBranch(saleTransactions, b.id), date),
      onDate(inBranch(swaps, b.id), date),
      onDate(inBranch(refunds, b.id), date),
    ),
  }));
  // Share is computed off the positive total so a refund-heavy outlet can't
  // produce a negative-width bar.
  const positiveTotal = splitRaw.reduce((s, r) => s + Math.max(0, r.netSales), 0);
  const outletSplit: OutletSplitRow[] = splitRaw.map((r) => ({
    ...r,
    share: positiveTotal > 0 ? Math.max(0, r.netSales) / positiveTotal : 0,
  }));

  // ---- Expenses ---------------------------------------------------------
  const expensesForDay = onDate(expenses, date);
  const expensesTotal =
    expensesForDay.reduce((sum, e) => sum + Math.round((Number(e.amount) || 0) * 100), 0) / 100;

  const expenseEntries: ExpenseEntry[] = expensesForDay
    .map((e, i): ExpenseEntry => ({
      key: e.id || `expense-${i}`,
      // A blank description would render as an unexplained amount, which is
      // worse than saying outright that nothing was written down. A salary is
      // named by its staff member instead, since the modal lets that one go
      // undescribed on purpose.
      description: expenseDisplayLabel(e, staff),
      amount: Number(e.amount) || 0,
    }))
    // Ties break on description so the rendered order can't shuffle between
    // renders — sort is stable, but the Firestore result order isn't.
    .sort((a, b) => b.amount - a.amount || a.description.localeCompare(b.description));

  // ---- Low stock, by days of cover -------------------------------------
  const velocityStart = addDays(date, -(VELOCITY_DAYS - 1));
  const soldUnits = new Map<string, number>();
  for (const sale of saleTransactions) {
    if (!sale.date || sale.date < velocityStart || sale.date > date) continue;
    if (!cylinderProducts.includes(sale.product)) continue;
    const key = `${sale.branch}::${sale.product}`;
    soldUnits.set(key, (soldUnits.get(key) || 0) + (Number(sale.quantity) || 0));
  }

  const lowStock: LowStockRow[] = [];
  const outletsMissingInventory: string[] = [];
  for (const b of branches) {
    const cells = onHandByBranch[b.id];
    // No inventory document for this outlet today means we know nothing about
    // its stock — not that its stock is zero. Skipped, and named to the caller.
    // (A doc that EXISTS but lacks a product's cell is different: that product
    // really does read 0, which is a genuine finding.)
    if (!cells || Object.keys(cells).length === 0) {
      outletsMissingInventory.push(b.name);
      continue;
    }
    for (const product of cylinderProducts) {
      const onHand = onHandFor(cells[product]);
      // Never counted here — see onHandFor. Not reported: unlike a whole outlet
      // with no counts, "this outlet doesn't stock this product" isn't actionable.
      if (onHand === null) continue;
      const sold = soldUnits.get(`${b.id}::${product}`) || 0;
      const perDay = sold / VELOCITY_DAYS;

      // Out of stock is worth flagging whether or not it has been selling —
      // a product at zero with no recent sales is still a product you cannot
      // sell today.
      if (onHand <= 0) {
        lowStock.push({
          key: `${b.id}::${product}`, product, branchId: b.id, branchName: b.name,
          onHand, perDay, daysOfCover: perDay > 0 ? 0 : null, level: "out",
        });
        continue;
      }
      // No sales in the window: there's no velocity to divide by, so days of
      // cover is undefined rather than infinite. Excluded — calling a
      // never-selling product "low" would bury the ones that actually move.
      if (perDay <= 0) continue;

      const daysOfCover = onHand / perDay;
      if (daysOfCover >= WATCH_DAYS) continue;
      lowStock.push({
        key: `${b.id}::${product}`, product, branchId: b.id, branchName: b.name,
        onHand, perDay, daysOfCover,
        level: daysOfCover < LOW_DAYS ? "low" : "watch",
      });
    }
  }
  // Most urgent first: OUT, then fewest days of cover.
  const levelRank: Record<StockLevel, number> = { out: 0, low: 1, watch: 2 };
  lowStock.sort((a, b) =>
    levelRank[a.level] - levelRank[b.level] ||
    (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0) ||
    a.product.localeCompare(b.product));

  // ---- Activity feed ----------------------------------------------------
  // collectionEventsInRange, NOT collectionEventsOnDate: the latter filters to
  // method === "cash" because it feeds drawer reconciliation, and 97-99% of
  // collections here arrive by CHECK. Using it would hide nearly the whole
  // collection stream from this feed.
  const collectionRows: FeedRow[] = collectionEventsInRange(arTransactions, date, date)
    .map(({ doc, event }, i): FeedRow => ({
      key: `collection-${doc.id || "x"}-${event.batchId || "x"}-${i}`,
      kind: "collection",
      ref: doc.invoice || "—",
      branchId: event.branch || "",
      branchName: branchName(event.branch || ""),
      // arMethodLabel, not the raw stored value: Receivables shows this same
      // event as "Online Payment", and the feed saying "gcash" is the drift
      // that helper exists to prevent.
      description: `${doc.customerName || "Unknown"} · ${arMethodLabel(event.method)}`,
      amount: Number(event.amount) || 0,
      // ArCollectionEventLike is the minimal structural contract the pure
      // receivables logic works against and omits createdAt — deliberately,
      // since events synthesized for legacy docs never had one. Stored events
      // do, so it's read here at the boundary; timeOf already falls back to the
      // date, which is the right answer for a legacy event with no timestamp.
      at: timeOf((event as { createdAt?: unknown }).createdAt, event.date || date),
    }));

  const feed: FeedRow[] = [
    ...onDate(saleTransactions, date).map((t): FeedRow => ({
      key: `sale-${t.id}`,
      kind: "sale",
      ref: t.invoice || "—",
      branchId: t.branch,
      branchName: branchName(t.branch),
      description: `${t.product} x${t.quantity || 1}`,
      amount: Number(t.totalAmount) || 0,
      at: timeOf(t.createdAt, t.date),
    })),
    ...onDate(swaps, date).map((s): FeedRow => ({
      key: `swap-${s.id}`,
      kind: "swap",
      ref: "—",
      branchId: s.branch,
      branchName: branchName(s.branch),
      description: `${s.productFrom} → ${s.productTo}`,
      amount: Number(s.price) || 0,
      at: timeOf(s.createdAt, s.date),
    })),
    ...onDate(refunds, date).map((r): FeedRow => ({
      key: `refund-${r.id}`,
      kind: "refund",
      ref: r.invoice || "—",
      branchId: r.branch,
      branchName: branchName(r.branch),
      description: (r.items || []).map((i) => `${i.product} x${i.qty}`).join(", ") || "Refund",
      amount: -(Number(r.totalRefund) || 0),
      at: timeOf(r.createdAt, r.date),
    })),
    ...collectionRows,
  ].sort((a, b) => b.at - a.at);

  return {
    netSales,
    outletSplit,
    expensesTotal,
    expenses: expenseEntries,
    lowStock,
    outletsMissingInventory,
    feed,
  };
}

// ---------------------------------------------------------------------------
// Pending A/R. Kept separate from buildDashboardSummary because it reads the
// live arTransactions rather than any dated window — outstanding A/R is a
// running balance, not a daily figure, so a date-scoped view would understate
// it badly.
// ---------------------------------------------------------------------------

export function summarizePendingAr(arTransactions: SaleTransaction[]): PendingArSummary {
  // arStatus().remaining, not totalAmount and not the whole AR portion — a
  // partial collection reduces what is still owed. customerKey(), not a raw
  // name compare, so "same customer" means what it means on the Receivables
  // and Customers screens. Both rules are shared with those screens on purpose.
  const open = (arTransactions || []).filter((t) => arStatus(t).status !== "collected");
  let totalCentavos = 0;
  const byAccount = new Map<string, { name: string; centavos: number }>();

  for (const t of open) {
    const centavos = Math.round(arStatus(t).remaining * 100);
    totalCentavos += centavos;
    const key = customerKey(t.customerName || "Unknown");
    const entry = byAccount.get(key) || { name: t.customerName || "Unknown", centavos: 0 };
    entry.centavos += centavos;
    byAccount.set(key, entry);
  }

  const accounts: ArAccount[] = [...byAccount.values()]
    .sort((a, b) => b.centavos - a.centavos || a.name.localeCompare(b.name))
    .map((a) => ({ name: a.name, amount: a.centavos / 100 }));

  return {
    total: totalCentavos / 100,
    openCount: open.length,
    accounts,
  };
}
