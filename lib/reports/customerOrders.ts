import { saleSectionLabel } from "../utils";
import { customerKey } from "../customers";
import type { SaleTransaction } from "../types";

// ---------------------------------------------------------------------------
// Customer Order History — pure aggregation.
//
// A customer x (product + section) matrix of quantity ordered, over whatever
// date range the screen asks for. No Firestore here; the range fetch lives in
// lib/hooks/useCustomerOrdersData.ts, and this module stays importable by the
// cron route (see the lib/* server-reachable rule).
//
// EVERY sale section counts — cylinders, accessories, other brands, and any
// category added later. There is deliberately no allowlist: a hardcoded set of
// sections is the exact bug class .claude/skills/safe-category-change.md exists
// to prevent, where a new category shows up on one screen and silently vanishes
// from another. The columns are derived from the documents in range, so a new
// category appears here the first time something in it is sold.
//
// SALES ONLY — refunds are not netted off, for two reasons:
//   1. Refund items use a DIFFERENT section vocabulary from sales
//      ("fullCylinder"/"emptyCylinder" per buildInventorySections' refundSource,
//      versus "cylinderWithRefill"/"refill" on a sale), so there is no sound
//      mapping from a returned item back to the column it came from.
//   2. An "emptyCylinder" return is an empty coming back, which is the normal
//      refill cycle rather than a cancelled order — subtracting it would
//      understate what the customer actually ordered.
// Returns have their own screen (/refunds); this one answers "what did they
// order".
//
// Swaps are absent for a related reason: a swap exchanges one cylinder for
// another and orders nothing new.
// ---------------------------------------------------------------------------

/**
 * Sale sections that represent a cylinder. Used ONLY for column ORDERING — the
 * two cylinder types sit first and stay adjacent per product, so "11KG PASAK
 * Refill" and "11KG PASAK Full Cylinder" can be read side by side. Nothing is
 * included or excluded on the basis of this list.
 */
const CYLINDER_SECTIONS = ["refill", "cylinderWithRefill"];

/** Grouping key for a sale with no customer attached. */
const NO_CUSTOMER_KEY = "__none__";
const NO_CUSTOMER_LABEL = "(No customer)";

const columnKey = (product: string, section: string) => `${product}|${section}`;

export interface CustomerOrdersColumn {
  /** `${product}|${section}`. */
  key: string;
  product: string;
  section: string;
  /** "Refill", "Full Cylinder", "Accessories", "Other Brands", … */
  type: string;
  /** True for the two cylinder sections — the UI colours those badges. */
  isCylinder: boolean;
}

export interface CustomerOrdersRow {
  /** customerId when present, else the trimmed name, else NO_CUSTOMER_KEY. */
  key: string;
  name: string;
  /** columnKey -> quantity. Absent means no order, which is not zero. */
  qtyByColumn: Record<string, number>;
  /**
   * Row total. NOT rendered — the screen shows per-column counts only. It
   * exists to order the rows (busiest customer first).
   */
  qtyTotal: number;
}

export interface CustomerOrdersMatrix {
  /** Every product+section ordered in the range; cylinders first (see below). */
  columns: CustomerOrdersColumn[];
  /** Only customers with orders in the range, largest first. */
  rows: CustomerOrdersRow[];
}

export interface CustomerOrdersInput {
  saleTransactions: SaleTransaction[];
  /** "YYYY-MM-DD" inclusive bounds — a free date range. */
  startDate: string;
  endDate: string;
  /** Branch id to restrict to; omit/empty for all outlets combined. */
  branch?: string;
}

interface Bucket {
  key: string;
  name: string;
  /** Latest date seen for `name`, so a renamed customer shows its newest name. */
  nameDate: string;
  qtyByColumn: Record<string, number>;
}

export function buildCustomerOrdersMatrix({
  saleTransactions,
  startDate,
  endDate,
  branch,
}: CustomerOrdersInput): CustomerOrdersMatrix {
  const buckets = new Map<string, Bucket>();
  /** columnKey -> {product, section} for every combination actually seen. */
  const seenColumns = new Map<string, { product: string; section: string }>();

  for (const sale of saleTransactions) {
    if (!sale.date) continue;
    if (branch && sale.branch !== branch) continue;
    if (sale.date < startDate || sale.date > endDate) continue;

    const qty = Number(sale.quantity) || 0;
    const product = sale.product || "(unnamed)";
    const section = sale.saleSection || "(unknown)";
    const col = columnKey(product, section);
    if (!seenColumns.has(col)) seenColumns.set(col, { product, section });

    const name = (sale.customerName || "").trim();
    // customerKey(), not the raw name: "same customer" has to mean here what it
    // means on Customers and Receivables, or a still-unmerged duplicate
    // (SANGAY/sagnay and friends) splits into two rows that each look partial.
    const key = sale.customerId || (name ? customerKey(name) : "") || NO_CUSTOMER_KEY;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, name: name || NO_CUSTOMER_LABEL, nameDate: sale.date, qtyByColumn: {} };
      buckets.set(key, bucket);
    } else if (name && sale.date >= bucket.nameDate) {
      // Renames cascade across docs, but older docs may still hold the old
      // name — let the most recent doc win so the row reads correctly.
      bucket.name = name;
      bucket.nameDate = sale.date;
    }
    bucket.qtyByColumn[col] = (bucket.qtyByColumn[col] || 0) + qty;
  }

  // Cylinder columns first, product A-Z, with Refill before Full Cylinder so a
  // product's two types stay adjacent. Everything else follows, grouped by
  // section then product. Ordering never depends on volume: sorting by quantity
  // would move a column every time the date range changed.
  const rank = (section: string) => {
    const i = CYLINDER_SECTIONS.indexOf(section);
    return i === -1 ? CYLINDER_SECTIONS.length : i;
  };
  const columns: CustomerOrdersColumn[] = [...seenColumns.entries()]
    .map(([key, { product, section }]) => ({
      key,
      product,
      section,
      type: saleSectionLabel(section),
      isCylinder: CYLINDER_SECTIONS.includes(section),
    }))
    .sort((a, b) => {
      const cylA = a.isCylinder ? 0 : 1;
      const cylB = b.isCylinder ? 0 : 1;
      if (cylA !== cylB) return cylA - cylB;
      if (a.isCylinder) {
        // Product-major so Refill and Full Cylinder sit side by side.
        return a.product.localeCompare(b.product) || rank(a.section) - rank(b.section);
      }
      // Section-major so each category forms one readable block.
      return a.section.localeCompare(b.section) || a.product.localeCompare(b.product);
    });

  const rows: CustomerOrdersRow[] = [];
  for (const bucket of buckets.values()) {
    const cells = bucket.qtyByColumn;
    if (Object.keys(cells).length === 0) continue;
    rows.push({
      key: bucket.key,
      name: bucket.name,
      qtyByColumn: cells,
      qtyTotal: Object.values(cells).reduce((sum, v) => sum + v, 0),
    });
  }

  // Largest first. Ties break alphabetically so the order can't shuffle between
  // renders — sort is stable, but the Firestore result order isn't.
  rows.sort((a, b) => b.qtyTotal - a.qtyTotal || a.name.localeCompare(b.name));

  return { columns, rows };
}
