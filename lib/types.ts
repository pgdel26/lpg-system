import { Timestamp, FieldValue } from "firebase/firestore";

export type ProductCategory =
  | "cylinder"
  | "accessories"
  | "cylinder_deposit"
  | string; // other categories exist and must not be dropped (see safe-category-change)

export type PaymentType = "cash" | "gcash" | "ar";
export type PricebookStatus = "active" | "draft" | "inactive";

// One payment applied to one AR sale doc via the Receivables page's Record
// Collection flow. A doc accumulates these over time (e.g. partly cash on one
// date, partly check on another) — see lib/receivables.ts for how they're
// read back into a status, and lib/hooks/useReceivablesData.ts for how a
// single collection (possibly spanning several docs via FIFO) writes them.
export interface ArCollectionEvent {
  amount: number;
  method: "cash" | "check" | "gcash";
  date: string;
  branch: BranchId;
  // Shared by every doc touched by one Record Collection action, so voiding
  // a mis-entered collection can find and reverse all of them together.
  batchId: string;
  checkDate?: string;
  checkNumber?: string;
  /** Free text the operator typed when recording it — why, or who handed it
   *  over. Absent on every event recorded before the field existed. */
  notes?: string;
  createdAt: Timestamp;
  // Set (never removed) when this event is reversed — kept in the array
  // rather than deleted so the collection history stays auditable. Excluded
  // from every balance/report calculation in lib/receivables.ts.
  voided?: boolean;
  voidedAt?: Timestamp;
  /** Last time an edit changed this event's method/branch/check details in
   *  place. Only set on the allocation-neutral edit path — an amount change
   *  voids the event and writes a replacement instead, so the old figure
   *  stays on the record rather than being overwritten. */
  editedAt?: Timestamp;
  /** batchId of the collection this event replaced, set on the events written
   *  by an amount edit. Links the replacement back to the voided originals so
   *  the history reads as one correction, not two unrelated collections. */
  replacesBatchId?: string;
}

// branches collection — doc ID doubles as the URL/branch slug (e.g. "pili").
// BranchId is deliberately `string`, not a "pili" | "cadlan" union — a third
// outlet must be addable via a new doc, not a code change (see safe-category-change,
// same hardcoded-enum bug class one level up).
export type BranchId = string;

export interface Branch {
  id: BranchId;
  name: string;
  active: boolean;
  sortOrder: number;
}

// products collection — keyed by `${category}_${name}`
export interface Product {
  category: ProductCategory;
  name: string;
  srp: number;
  srpRefill: number | null; // null for non-cylinder
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ProductMap = Record<string, Product>;

// pricebooks collection
export interface Pricebook {
  id: string;
  name: string;
  effectiveDate: string;
  prices: Record<string, unknown>; // price map; shape consumed by getPricebookSrp()
  status: PricebookStatus;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  activatedAt?: Timestamp;
}

// customers collection
export interface Customer {
  id: string;
  name: string;
  phone: string;
  /**
   * The customerCategories document this customer belongs to, or absent/"" for
   * uncategorised — which is what every customer is until someone files them.
   *
   * An ID, not the category's name: renaming a category then costs one write on
   * the category document instead of a cascade across every customer in it. The
   * opposite trade-off from `customerName` on a sale, which IS copied and does
   * cascade, because a sale document has to stay readable on its own.
   */
  categoryId?: string;
  createdAt: Timestamp;
}

// customerCategories collection — the operator's own filing scheme for
// customers (dealer, walk-in, institutional…). Deliberately free-form: these
// are business labels, not a fixed enum in code, so the app never has to ship
// to add one.
export interface CustomerCategory {
  id: string;
  name: string;
  createdAt?: Timestamp;
}

// customerTargets collection — one doc per customer per product, doc id
// `${customerId}_${product}` (see targetDocId in lib/customerTargets.ts). Keyed
// rather than auto-id so writing a target is an idempotent upsert: one customer
// can never end up with two rows competing for the same product.
//
// STANDING agreements, not monthly ones. They were keyed by month until the
// owner said the discounts don't change month to month — so a month in the key
// only created drift, where editing in September silently left August saying
// something else. The VOLUME is still measured per calendar month; it is the
// agreement that no longer moves.
export interface CustomerTarget {
  id: string;
  customerId: string;
  /**
   * "YYYY-MM" on LEGACY month-keyed documents only. Standing agreements carry
   * no month, and every consumer skips a document that has one — a month-keyed
   * row is from the old model and would otherwise be read as a standing
   * agreement that happens to apply forever.
   */
  month?: string;
  /**
   * The product this agreement is for. OPTIONAL only because legacy documents
   * predate per-product targets — one figure per customer per month, written
   * before the owner asked for it per product. Those documents are left in
   * Firestore and never read: every consumer skips a target with no `product`,
   * so a blended old figure can't be shown as one product's agreement. Anything
   * this app writes today always sets it.
   */
  product?: string;
  /** Units of that product the customer must buy in a month to earn the discount. */
  targetQty: number;
  /**
   * Pesos off per unit, once the target is reached. THE CURRENT RATE — every
   * reader uses this field; `discountHistory` is the log of how it got here.
   *
   * The duplication is deliberate: deriving the current rate by sorting the log
   * would make every consumer of a discount depend on the log's shape, and a
   * malformed entry would then change what the app charges rather than just
   * what the history modal shows.
   */
  discountPerUnit: number;
  /**
   * Log of what this discount has been, oldest first. Written only by
   * setCustomerDiscount — which is why the grid's Discount cell is read-only: a
   * second way to change the rate would leave holes in this.
   *
   * Appended by read-modify-write, so it is last-write-wins rather than truly
   * append-only: two people setting a rate on the same product within a second
   * of each other would lose the earlier entry. `discountPerUnit` is a separate
   * scalar and stays correct either way, so the risk is a missing line in the
   * history modal, not a wrong rate.
   */
  discountHistory?: DiscountChange[];
  updatedAt?: Timestamp;
}

/** One entry in a target's discount log. */
export interface DiscountChange {
  /** Pesos off per unit from `from` until the next entry (or until now). */
  discountPerUnit: number;
  /** "YYYY-MM-DD" the rate took effect — the day it was set. */
  from: string;
  /** When the row was written, for ordering two changes made on one day. */
  changedAt?: Timestamp;
}

// NOTE: settings/customerTargets (the old countedCategories list) is orphaned.
// Targets are per product now, so the product itself says what counts, and the
// scope is derived from the catalog's sale sections — see targetProductScope in
// lib/customerTargets.ts. The document is left in Firestore, read by nothing.

// A doc's own share of one payment method. Multiple sale docs (one per line
// item) can each carry a payments array — see lib/payments.ts for how they're
// summed into Cash/GCash/AR totals for reporting.
export interface SalePayment {
  method: PaymentType;
  amount: number;
  gcashRef?: string;
}

// saleTransactions collection (plus AR fields set by handleMarkArCollected)
export interface SaleTransaction {
  id: string;
  saleSection: string;
  product: string;
  productCategory: ProductCategory;
  srp: number;
  discount: number;
  deliveryCharge: number;
  /**
   * Tax charged on top of this line, in pesos. Stamped whole onto a sale's
   * FIRST line document, like deliveryCharge — it belongs to the sale, not to
   * any one item.
   *
   * Already INSIDE totalAmount: it is what the customer pays, and the payment
   * split matches the total. Kept in its own field so a report can show or net
   * out the tax; today every report reads totalAmount as revenue, tax included.
   */
  tax?: number;
  finalPrice: number;
  quantity: number;
  totalAmount: number;
  invoice: string;
  customerId: string;
  customerName: string;
  // Set to whichever method this doc has the largest allocated amount in
  // (or "ar" if any AR allocation is present) — existing paymentType==="ar"
  // queries (Receivables, the cron report) keep working unchanged. The real
  // per-method breakdown lives in `payments` (see lib/payments.ts).
  paymentType: PaymentType;
  pricebookId: string | null;
  date: string;
  branch: BranchId;
  // Shared across every line-item doc written by one recordSale call — the
  // closest thing to a "sale id" today, since each item is its own doc.
  saleGroupId?: string;
  // This doc's share of each payment method; sum(payments[].amount) must
  // equal totalAmount to the centavo. Absent on pre-split-payment docs —
  // lib/payments.ts falls back to paymentType/totalAmount for those.
  payments?: SalePayment[];
  createdAt: Timestamp;
  checkDate?: string;
  checkAmount?: number;
  gcashRef?: string;
  // Legacy-only: written by the old all-or-nothing "Mark Collected" flow,
  // before per-event collection tracking existed. No longer written by the
  // app — every collection recorded since is tracked exclusively via
  // arCollections below, which always takes priority when present (see
  // lib/receivables.ts's arCollectionEvents). Left in place only so old,
  // untouched docs keep reading correctly.
  arCollected?: boolean;
  collectedDate?: string;
  collectionMethod?: string;
  // Every collection event ever recorded against this invoice, written by
  // the Receivables page's Record Collection flow — source of truth for
  // partial payments. Absent on docs untouched by it (including legacy docs,
  // which lib/receivables.ts's arCollectionEvents synthesizes one event for
  // from the fields above).
  arCollections?: ArCollectionEvent[];
}

// purchases collection
export interface Purchase {
  id: string;
  purchaseSection: string;
  product: string;
  productCategory: ProductCategory;
  quantity: number;
  /** Per-line cost is only present on docs recorded before 2026-08 (and on any
   *  future itemization). The supplier does not break a delivery down at
   *  purchase time — only the day's total is known — so new purchase lines
   *  carry quantity with no cost, and the cost lives in purchaseDelivery.
   *  See lib/reports/purchaseCost.ts for the one rule that reads both. */
  unitCost?: number;
  totalCost?: number;
  /** Links this line to its purchaseDelivery, which carries the cost. Absent on
   *  docs from the per-line era. */
  deliveryId?: string;
  date: string;
  // Purchases aren't a separate screen per outlet, but each doc still carries
  // which outlet bought the stock so per-outlet Inventory's PURCHASES column
  // stays accurate.
  branch: BranchId;
  // Inter-branch stock transfers are recorded as a same-collection purchase
  // pair (source: negative quantity, destination: positive), so they flow
  // through the existing PURCHASES→END math with no new column type. These
  // fields distinguish them from real supplier purchases in the UI and let
  // the two docs be merged back into a single displayed row.
  isTransfer?: boolean;
  transferBranch?: BranchId;
  transferGroupId?: string;
  createdAt: Timestamp;
}

// purchaseDelivery collection — one doc per delivery, holding the amount payable
// for it. That total is all the operator knows at purchase time: the supplier
// bills a delivery total and itemizes a month later, if at all. Two deliveries on
// one date are two docs, so neither has to be a running total. Purchase line docs
// point back via `deliveryId`.
//
// IDs: deliveries recorded through the app get an auto id. The 90 docs written by
// scripts/backfill-purchase-deliveries.mjs use a deterministic `<branch>_<date>`
// id instead, which made that migration idempotent and enforces the one-per-date
// assumption it had to make about pre-delivery history. Never derive meaning from
// the id shape — read the fields.
export interface PurchaseDelivery {
  id: string;
  date: string;
  branch: BranchId;
  totalCost: number;
  /** True when nobody has entered this delivery's cost yet, so `totalCost: 0` is
   *  a placeholder rather than a real figure. Set on the pre-July-2026 and
   *  August deliveries created by the backfill, whose lines were recorded before
   *  any cost was captured. A genuinely zero-billed delivery (a supplier
   *  replacement, say) is a real thing and does NOT carry this flag — that
   *  distinction is the whole reason the field exists. Reports must show these as
   *  uncosted, never as ₱0.00, which would read as free stock. */
  costPending?: boolean;
  createdAt: Timestamp;
}

// refunds collection
export interface RefundItem {
  section: string;
  product: string;
  qty: number;
  value: number;
  defective: boolean;
  defectStatus: string;
}
export interface Refund {
  id: string;
  invoice: string;
  customerName: string;
  customerId: string;
  items: RefundItem[];
  totalRefund: number;
  reason: string;
  date: string;
  branch: BranchId;
  createdAt: Timestamp;
}

// swaps collection — verified against handleRecordSwap (app/page.js ~line 813)
// Payload: { productFrom, productTo, price, customerId, customerName, date, createdAt }
export interface Swap {
  id: string;
  productFrom: string;
  productTo: string;
  price: number;
  customerId: string;
  customerName: string;
  date: string;
  branch: BranchId;
  createdAt: Timestamp;
}

// expenses collection — verified against handleAddExpense (app/page.js ~line 1270)
// Payload: { date, description, amount, createdAt }
export interface Expense {
  id: string;
  /** Optional for a salary, where the staff member identifies it — see
   *  lib/expenses.ts's expenseDisplayLabel. Required for anything else. */
  description: string;
  amount: number;
  date: string;
  branch: BranchId;
  /** "salary" | "operating" (see lib/expenses.ts). Absent on every expense
   *  recorded before the field existed — those read as uncategorised rather
   *  than being assumed into a bucket nobody chose. */
  category?: string;
  /** Staff doc id, only for a salary. Resolved to a name at read time so a
   *  rename updates history instead of leaving a stale copy behind. */
  staffId?: string;
  createdAt: Timestamp;
}

// staff collection — verified against handleAddStaff (app/page.js ~line 1309)
// Payload: { name, role, phone, createdAt }
export interface Staff {
  id: string;
  name: string;
  role: string;
  phone: string;
  createdAt: Timestamp;
}

// dailyReport doc — VERIFY against setDailyStaff / handleUpdateDailyStaff usage
export interface DailyReport {
  cashier: string | null;
  staff: string[];
}

export type NotificationRecipient = string; // email

// dailyInventory collection — verified against saveSection (app/page.js ~line 593)
// Doc shape: { date, section, items, updatedAt }
// Per-product cell fields come from buildInventorySections (lib/constants.js):
//   full section:        beg, planta, sold, refillSales, swap, returns, end, aud, audReason, var
//   empty section:       beg, toPlanta, refillIn, swapIn, returned, end, aud, audReason, var
//   accessories section: beg, delivery, sold, defective, end, aud, audReason, var
// `end` is computed by calcEnd and persisted; `var` is also computed.
// `aud`/`audReason` may be cleared via deleteField() so they can be absent.
export interface InventoryCell {
  beg?: number;
  // full cylinder fields
  planta?: number;
  sold?: number;
  refillSales?: number;
  swap?: number;
  returns?: number;
  // empty cylinder fields
  toPlanta?: number;
  refillIn?: number;
  swapIn?: number;
  returned?: number;
  // accessories fields
  delivery?: number;
  defective?: number;
  // computed / persisted for all sections
  end?: number;
  aud?: number | FieldValue;
  audReason?: string | FieldValue;
  var?: number;
}

export interface DailyInventoryDoc {
  date: string;
  section: string;
  items: Record<string, InventoryCell>;
  updatedAt: Timestamp;
}

// In-memory inventory state: sectionKey → product → InventoryCell
export type InventoryState = Record<string, Record<string, InventoryCell>>;

// returned by fetchCustomerTransactions
export type CustomerTxnType = "sale" | "swap" | "refund";
export interface CustomerTransaction {
  id: string;
  type: CustomerTxnType;
  createdAt?: Timestamp;
  [key: string]: unknown;
}
