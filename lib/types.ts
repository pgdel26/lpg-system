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
  createdAt: Timestamp;
  // Set (never removed) when this event is reversed — kept in the array
  // rather than deleted so the collection history stays auditable. Excluded
  // from every balance/report calculation in lib/receivables.ts.
  voided?: boolean;
  voidedAt?: Timestamp;
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
  createdAt: Timestamp;
}

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
   *  carry quantity with no cost, and the cost lives in purchaseDailyCost.
   *  See lib/reports/purchaseCost.ts for the one rule that reads both. */
  unitCost?: number;
  totalCost?: number;
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

// purchaseDailyCost collection — one doc per date+branch, id `{date}_{branch}`
// (same keying as dailyInventory / dailyReport). Holds the amount payable for
// that day's delivery, which is all the operator knows at purchase time.
export interface PurchaseDailyCost {
  date: string;
  branch: BranchId;
  totalCost: number;
  updatedAt: Timestamp;
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
  description: string;
  amount: number;
  date: string;
  branch: BranchId;
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
