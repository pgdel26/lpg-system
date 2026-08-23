// Single shared implementation of "how much has been collected against this
// AR sale doc, and how much is left." Every surface that shows or sums AR
// status (Receivables list, Top Debtors, Sales Report's Collections row, the
// admin-SDK cron report) must go through this instead of re-deriving it —
// same reasoning as lib/payments.ts's paymentSplit(). In particular, nothing
// outside this file should read `t.arCollected` / `t.collectedDate` /
// `t.collectionMethod` directly — those three fields are legacy-only
// (untouched docs from before per-event tracking existed); every doc this
// feature has ever recorded a collection against carries a real
// `arCollections` array instead, which always wins over the legacy fields.
//
// Structurally typed (not against SaleTransaction) so it also works from
// lib/reports/salesReport.ts, called from the admin-SDK cron route with plain
// objects typed by its own local interface.
import { paymentSplit, type PaymentSplitLike } from "./payments";
import { customerKey } from "./customers";

export interface ArCollectionEventLike {
  amount?: number;
  method?: string;
  date?: string;
  branch?: string;
  batchId?: string;
  voided?: boolean;
  /** Free-text note the operator typed when recording the collection. Display
   *  only — no calculation reads it. */
  notes?: string;
}

export interface ArStatusLike extends PaymentSplitLike {
  id?: string;
  branch?: string;
  arCollected?: boolean;
  collectedDate?: string;
  collectionMethod?: string;
  arCollections?: ArCollectionEventLike[];
}

const EPSILON = 0.005;
const round2 = (n: number): number => Math.round(n * 100) / 100;

// Legacy docs (collected before this feature existed) have no `arCollections`
// array — synthesize the one event they implicitly represent so callers never
// need a second code path. A legacy PENDING doc has no events at all. The
// synthesized batchId is keyed on the doc's own id (not its date) so voiding
// it can never touch any other doc, even one collected on the same date.
export function arCollectionEvents(t: ArStatusLike): ArCollectionEventLike[] {
  if (t.arCollections && t.arCollections.length > 0) return t.arCollections;
  if (t.arCollected) {
    return [{
      amount: paymentSplit(t).ar,
      method: t.collectionMethod || "cash",
      batchId: `legacy:${t.id || ""}`,
      // Omitted entirely (not set to `undefined`) when absent on the source
      // doc — a doc with a `date`/`branch` key explicitly set to `undefined`
      // fails to write to Firestore ("Unsupported field value") the moment
      // this synthesized event is voided and its array gets persisted.
      ...(t.collectedDate ? { date: t.collectedDate } : {}),
      // Attributed to the invoice's own branch — the only attribution that
      // existed before per-event branch tracking, and what old reports were
      // already computed with (see [branch]/sales/page.tsx's prior filter).
      ...(t.branch ? { branch: t.branch } : {}),
    }];
  }
  return [];
}

export interface ArStatus {
  arTotal: number;
  collected: number;
  remaining: number;
  status: "pending" | "partial" | "collected";
}

function statusFromEvents(arTotal: number, events: ArCollectionEventLike[]): ArStatus {
  const collected = round2(events.reduce((sum, e) => sum + (e.amount || 0), 0));
  const remaining = Math.max(0, round2(arTotal - collected));
  const status: ArStatus["status"] =
    remaining <= EPSILON ? "collected" : collected > EPSILON ? "partial" : "pending";
  return { arTotal, collected, remaining, status };
}

export function arStatus(t: ArStatusLike): ArStatus {
  return statusFromEvents(paymentSplit(t).ar, arCollectionEvents(t).filter((e) => !e.voided));
}

// Status as it stood on `date` — only events dated on or before it count.
// Used by historical reports (e.g. a past day's Sales Report) so a doc later
// settled on some future date doesn't retroactively change what that day's
// report says happened. Nothing outside lib/receivables.ts should re-derive
// this by filtering arCollectionEvents() directly.
export function arStatusAsOf(t: ArStatusLike, date: string): ArStatus {
  return statusFromEvents(
    paymentSplit(t).ar,
    arCollectionEvents(t).filter((e) => !e.voided && e.date && e.date <= date)
  );
}

// Display label for a settled/partially-settled doc's method(s). A doc can
// be paid down by more than one method over time (e.g. partly cash, later a
// check) — "Mixed" says so honestly instead of picking whichever event a
// naive "last one" comparison happens to favor.
/**
 * Display label for one AR collection method.
 *
 * The STORED value stays "gcash" — every filter keys on it and months of events
 * already carry it, so renaming the value would orphan history. Only the label
 * changed to "Online Payment". Kept in one place because the same ternary was
 * written out in the modal, the Receivables event list, the void confirmation
 * and collectionMethodLabel below.
 *
 * Distinct from a SALE's payment method (SalePayment.method) — a different field
 * on a different document, still labelled "GCash".
 */
export function arMethodLabel(method: string | undefined): string {
  if (method === "check") return "Check";
  if (method === "gcash") return "Online Payment";
  return "Cash";
}

export function collectionMethodLabel(t: ArStatusLike): string | null {
  const active = arCollectionEvents(t).filter((e) => !e.voided);
  if (active.length === 0) return null;
  const methods = new Set(active.map((e) => e.method));
  if (methods.size > 1) return "Mixed";
  return arMethodLabel(active[0].method);
}

export interface FifoTarget {
  id: string;
  date: string;
  createdAtSeconds: number;
  remaining: number;
}

export interface FifoAllocation {
  id: string;
  amount: number;
}

// Applies `amount` (pesos) across a customer's outstanding invoices, oldest
// first. All arithmetic is done in whole centavos so allocations always sum
// to exactly `amount` — no rounding residue to push onto a "last" row.
// Docs with remaining <= 0 are assumed already filtered out by the caller.
export function allocateFifo(targets: FifoTarget[], amount: number): FifoAllocation[] {
  const sorted = [...targets].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.createdAtSeconds !== b.createdAtSeconds) return a.createdAtSeconds - b.createdAtSeconds;
    return a.id.localeCompare(b.id);
  });
  let remainingCentavos = Math.round(amount * 100);
  const allocations: FifoAllocation[] = [];
  for (const target of sorted) {
    if (remainingCentavos <= 0) break;
    const targetCentavos = Math.round(target.remaining * 100);
    const applyCentavos = Math.min(targetCentavos, remainingCentavos);
    if (applyCentavos <= 0) continue;
    allocations.push({ id: target.id, amount: applyCentavos / 100 });
    remainingCentavos -= applyCentavos;
  }
  return allocations;
}

export interface CollectionEventEntry<T> {
  doc: T;
  event: ArCollectionEventLike;
}

// Every non-voided cash event recorded on `date` — the single source of
// truth for both the Sales Report's Collections figure and its "N invoices"
// caption, so the two numbers can never drift apart. Check and GCash
// collections reduce the receivable but never touch the physical drawer, so
// only "cash" counts. When `branch` is given, only counts events recorded at
// that outlet — a collection is attributed to where the money was physically
// received, not to the invoice's original branch (a customer can owe at one
// outlet and pay at another).
export function collectionEventsOnDate<T extends ArStatusLike>(
  docs: T[],
  date: string,
  branch?: string,
): CollectionEventEntry<T>[] {
  const results: CollectionEventEntry<T>[] = [];
  for (const t of docs) {
    for (const e of arCollectionEvents(t)) {
      if (e.voided) continue;
      if (e.date !== date) continue;
      if (e.method !== "cash") continue;
      if (branch !== undefined && e.branch !== branch) continue;
      results.push({ doc: t, event: e });
    }
  }
  return results;
}

// Every non-voided collection event dated within [startDate, endDate],
// regardless of method — unlike collectionEventsOnDate (single day,
// cash-only, for the drawer-reconciliation figure), this is for period
// reports that need to bucket collections by method themselves (e.g. "how
// much AR did we collect this period, split by cash vs GCash vs check").
// Caller must pass the UNBOUNDED AR doc list (e.g. useReceivablesData's
// live `arTransactions`), not a date-ranged fetch of saleTransactions — an
// invoice sold last month can be collected this month, and a range query on
// the sale's own `date` would never see that collection.
export function collectionEventsInRange<T extends ArStatusLike>(
  docs: T[],
  startDate: string,
  endDate: string,
  branch?: string,
): CollectionEventEntry<T>[] {
  const results: CollectionEventEntry<T>[] = [];
  for (const t of docs) {
    for (const e of arCollectionEvents(t)) {
      if (e.voided) continue;
      if (!e.date || e.date < startDate || e.date > endDate) continue;
      if (branch !== undefined && e.branch !== branch) continue;
      results.push({ doc: t, event: e });
    }
  }
  return results;
}

export interface ArRollForwardRow {
  /** customerKey() — stable grouping id, also safe as a React key. */
  key: string;
  /** One doc's display spelling of the name, not the normalized key. Which one
   *  depends on the input order (useReceivablesData sorts createdAt desc, so in
   *  practice the most recent), matching TopDebtorsChart's behavior. */
  name: string;
  beginning: number;
  added: number;
  collected: number;
  ending: number;
  /** beginning + added - collected - ending. Zero for every row in clean data;
   *  non-zero means one of the break cases in arRollForward's docstring has
   *  occurred, and the UI must say so rather than print an equation that
   *  doesn't add up. */
  drift: number;
}

export interface ArRollForwardDoc extends ArStatusLike {
  date?: string;
  customerName?: string;
}

/**
 * Per-customer A/R roll-forward over [startDate, endDate]:
 *
 *   beginning + added - collected === ending
 *
 * The four figures are meant to read as one equation rather than four unrelated
 * numbers. The identity is NOT guaranteed by construction — it holds only while
 * the write paths keep out the three inputs listed below — so every row also
 * carries `drift`, and the UI surfaces any row where it is non-zero. Note that
 * per-customer netting can hide a per-invoice break, which is why drift is
 * computed per row and not just on the totals.
 *
 * Each term sits on the axis it belongs on:
 *   beginning — owed on invoices dated BEFORE startDate, net of collections
 *               dated before startDate (a point-in-time balance)
 *   added     — A/R portion of invoices dated inside the period (invoice axis)
 *   collected — collection events dated inside the period (payment axis)
 *   ending    — the same point-in-time balance, computed at endDate
 *
 * Comparisons are lexicographic on YYYY-MM-DD strings, so "before startDate"
 * is a plain `< startDate`: no date arithmetic, no timezone to get wrong.
 *
 * Three things would break the identity; none occurs in the data today
 * (verified across June/July/August 2026 — drift 0.00 each month):
 *   - an invoice collected for MORE than its A/R portion, since the two
 *     balance terms clamp at 0 per invoice while `collected` does not;
 *   - a collection dated before its own invoice. recordArCollection rejects this
 *     for writes made since its tooEarlyFor check landed, but legacy docs
 *     predate the check and are unguarded;
 *   - an invoice with no date at all, which is skipped entirely (a collection on
 *     it would then be counted by collectionEventsInRange but not here).
 *
 * Collections with no date are NOT a break case: they fall back to the invoice's
 * date, so `ending` converges to the same figure as arStatus/Total Pending.
 */
export function arRollForward<T extends ArRollForwardDoc>(
  docs: T[],
  startDate: string,
  endDate: string,
): ArRollForwardRow[] {
  // Accumulated in whole centavos, the same way allocateFifo works below.
  // Rounding the four terms on different boundaries is what lets the on-screen
  // equation visibly fail — paymentSplit's `payments` branch does not round, so
  // a split-payment doc can carry float residue into arTotal and drift a
  // centavo per invoice.
  const cents = (n: number) => Math.round(n * 100);
  type Acc = { key: string; name: string; beginning: number; added: number; collected: number; ending: number };
  const rows = new Map<string, Acc>();
  for (const t of docs) {
    const arTotal = cents(paymentSplit(t).ar);
    const invoiceDate = t.date;
    if (arTotal <= 0 || !invoiceDate) continue;

    // A collection with no date falls back to the invoice's own date. Those are
    // legacy docs marked paid with no record of when; attributing them to the
    // month the invoice was raised is an assumption, but excluding them instead
    // leaves `ending` permanently above the real balance by their total — and
    // visibly disagreeing with Total Pending on the sibling tab.
    //
    // Deliberately applied HERE rather than by writing collectedDate onto the
    // docs: collectionEventsOnDate feeds the Sales Report's drawer-cash figure
    // and matches on a real date, so a stored date turns a credit sale into a
    // same-day cash collection and reports a false shortage for that day.
    // Keeping the fallback in the read path makes that impossible by
    // construction, because those events still carry no date in the data.
    const events = arCollectionEvents(t)
      .filter((e) => !e.voided)
      .map((e) => ({ amount: e.amount || 0, date: e.date || invoiceDate }));
    const sumWhere = (pred: (d: string) => boolean) =>
      events.reduce((sum, e) => sum + (pred(e.date) ? cents(e.amount) : 0), 0);

    const beginning = invoiceDate < startDate ? Math.max(0, arTotal - sumWhere((d) => d < startDate)) : 0;
    const added = invoiceDate >= startDate && invoiceDate <= endDate ? arTotal : 0;
    const collected = sumWhere((d) => d >= startDate && d <= endDate);
    const ending = invoiceDate <= endDate ? Math.max(0, arTotal - sumWhere((d) => d <= endDate)) : 0;

    const key = customerKey(t.customerName || "Unknown");
    const row = rows.get(key)
      || { key, name: t.customerName || "Unknown", beginning: 0, added: 0, collected: 0, ending: 0 };
    row.beginning += beginning;
    row.added += added;
    row.collected += collected;
    row.ending += ending;
    rows.set(key, row);
  }
  return Array.from(rows.values())
    .map((r) => ({
      key: r.key, name: r.name,
      beginning: r.beginning / 100, added: r.added / 100,
      collected: r.collected / 100, ending: r.ending / 100,
      drift: (r.beginning + r.added - r.collected - r.ending) / 100,
    }))
    // An all-zero row is noise on a screen meant for chasing balances. This also
    // removes rows for invoices dated after endDate, which produce four zeros.
    .filter((r) => r.beginning > EPSILON || r.added > EPSILON
      || r.collected > EPSILON || r.ending > EPSILON || Math.abs(r.drift) > EPSILON)
    // Alphabetical by customer. Case-insensitive via sensitivity:"base", or the
    // mixed casing in the data ("metro fiesta" next to "NIKKA BABES") would sort
    // every lowercase name into a separate block after the uppercase ones.
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function collectionsOnDate<T extends ArStatusLike>(
  docs: T[],
  date: string,
  branch?: string,
): number {
  return round2(collectionEventsOnDate(docs, date, branch).reduce((sum, { event }) => sum + (event.amount || 0), 0));
}

export interface BatchSummary {
  amount: number;
  invoiceCount: number;
  method?: string;
}

// Total across every doc one Record Collection action touched — needed
// before voiding, since a single collection commonly spans several invoices
// via FIFO and the confirmation must state the whole batch's impact, not
// whichever one invoice the operator happened to have expanded.
export function batchSummary<T extends ArStatusLike>(docs: T[], batchId: string): BatchSummary {
  let amount = 0;
  let invoiceCount = 0;
  let method: string | undefined;
  for (const t of docs) {
    const matches = arCollectionEvents(t).filter((e) => e.batchId === batchId && !e.voided);
    if (matches.length === 0) continue;
    invoiceCount += 1;
    for (const e of matches) {
      amount += e.amount || 0;
      method = e.method;
    }
  }
  return { amount: round2(amount), invoiceCount, method };
}
