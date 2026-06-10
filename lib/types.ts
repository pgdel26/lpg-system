import { Timestamp, FieldValue } from "firebase/firestore";

export type ProductCategory =
  | "cylinder"
  | "accessories"
  | "cylinder_deposit"
  | string; // other categories exist and must not be dropped (see safe-category-change)

export type PaymentType = "cash" | "gcash";
export type PricebookStatus = "active" | "draft" | "inactive";

// products collection — keyed by `${category}_${name}`
export interface Product {
  category: ProductCategory;
  name: string;
  srp: number;
  srpRefill: number | null; // null for non-cylinder
  sortOrder: number;
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
  paymentType: PaymentType;
  pricebookId: string | null;
  date: string;
  createdAt: Timestamp;
  checkDate?: string;
  checkAmount?: number;
  gcashRef?: string;
  arCollected?: boolean;
  collectedDate?: string;
  collectionMethod?: string;
}

// purchases collection
export interface Purchase {
  id: string;
  purchaseSection: string;
  product: string;
  productCategory: ProductCategory;
  quantity: number;
  unitCost: number;
  totalCost: number;
  date: string;
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
  createdAt: Timestamp;
}

// expenses collection — verified against handleAddExpense (app/page.js ~line 1270)
// Payload: { date, description, amount, createdAt }
export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
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
