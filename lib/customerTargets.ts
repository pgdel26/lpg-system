import { categoryOf, saleUnits } from "./productCategory";
import type { SalesSection } from "./constants";
import type { Customer, CustomerTarget, SaleTransaction } from "./types";

// ---------------------------------------------------------------------------
// Customer monthly target volumes — pure logic.
//
// A customer agrees to buy N units OF ONE PRODUCT in a month; hitting N earns a
// peso-per-unit discount on that product. This module answers, for one month:
// how much of each product did a customer actually buy, did they reach the
// target, and what did that earn.
//
// PER PRODUCT, not per customer. It began as one figure per customer per month
// and the owner asked for it per product — a customer takes 300 of the 11KG and
// 50 of the 50KG, and one blended number could be reached by a mix nobody
// agreed to. The old customer-level documents are LEFT IN FIRESTORE and simply
// never read: nothing here matches a target document without a `product`, so a
// legacy row can neither be shown nor be mistaken for one product's agreement.
//
// NOTHING HERE IS EVER WRITTEN BACK. "Earned" is derived at read time from the
// sales plus the target rule, and never stamped onto a sale, a customer or the
// target document. That is the rule from the false-cash-shortage incident: a
// derived value written into a record becomes a second source of truth, and the
// moment a sale is voided or a target corrected, the stored figure is a lie
// with no visible cause. Recomputing costs nothing here.
//
// THE APP NEVER APPLIES THE DISCOUNT EITHER. The operator still types it into
// Record Sale by hand, exactly as before. This module only tells them whether
// it has been earned — which is why a wrong target here can mislead someone,
// but cannot by itself mis-price a sale.
//
// Pure module: no hooks, no Firestore (see the lib/* server-reachable rule in
// CLAUDE.md).
// ---------------------------------------------------------------------------

/**
 * Doc id for one customer's target on one product in one month. Keyed, not
 * auto-id, so writing is an idempotent upsert — the same shape as
 * `products/{category}_{name}`.
 *
 * The product is percent-encoded: a name is free text and a "/" would otherwise
 * split the document path, while a plain character swap would collide "11KG A/B"
 * with "11KG A-B". Encoding is reversible and can't collide. The id is only ever
 * an address, though — every read takes the product from the document's own
 * `product` field.
 */
export const targetDocId = (customerId: string, month: string, product: string): string =>
  `${customerId}_${month}_${encodeURIComponent(product)}`;

/** The "YYYY-MM" a "YYYY-MM-DD" belongs to. */
export const monthOf = (dateStr: string): string => dateStr.slice(0, 7);

/**
 * Inclusive "YYYY-MM-DD" bounds of a month.
 *
 * The end is the month's real last day even for the CURRENT month — unlike the
 * Monthly Sales report, which stops at today. A target is a whole-month
 * agreement, so the window it is measured over does not shrink because the
 * month is unfinished; only the sales inside it are fewer.
 */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** The month before this one. "2026-01" -> "2025-12". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}

/** "2026-08" -> "August 2026", for headings. */
export const formatMonth = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`)
    .toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * What the target grid covers: every product the business sells, and the
 * categories those products are sold under.
 *
 * Derived from the SALES SECTIONS, which are already this app's one definition
 * of "sellable" — so a category added next year lists its products here with no
 * code change, and one hidden from sales (a refundable deposit) stays out. That
 * is the same source the Monthly Sales report uses, and it replaces the manual
 * "what counts toward targets" setting: with a row per product, the product
 * itself says what counts, and a setting that could silently exclude a listed
 * row was only ever a way to make Actual read zero forever.
 *
 * The categories matter even though rows are per product: a product name can
 * exist under a category that is NOT sold (a `cylinder_deposit` named after the
 * cylinder it secures), and counting a refundable deposit toward a cylinder
 * target would report an unearned discount.
 */
export function targetProductScope(
  salesSections: SalesSection[],
): { products: string[]; categories: string[] } {
  const products = new Set<string>();
  const categories = new Set<string>();
  for (const section of salesSections) {
    if (section.productCategory) categories.add(section.productCategory);
    for (const name of section.products || []) products.add(name);
    for (const group of section.subgroups || []) {
      for (const name of group.products || []) products.add(name);
    }
  }
  return {
    products: [...products].sort((a, b) => a.localeCompare(b)),
    categories: [...categories],
  };
}

/**
 * Targets for one month that are per-product, i.e. everything this app writes
 * today. A document with no `product` is a legacy customer-level agreement and
 * is skipped everywhere — see the header.
 */
const productTargetsIn = (targets: CustomerTarget[], month: string): CustomerTarget[] =>
  targets.filter((t) => t.month === month && !!t.product);

export interface ProductTargetRow {
  product: string;
  /**
   * False when this customer has no target document for this product in this
   * month — the common case. The row still exists and is still editable; it
   * just has nothing set yet, and the screen shows blank inputs rather than a
   * misleading 0/0.
   */
  hasTarget: boolean;
  targetQty: number;
  discountPerUnit: number;
  /** Units of this product bought in the month, across every outlet. */
  actualQty: number;
  reached: boolean;
  /** Units still needed. 0 once reached. */
  remaining: number;
  /**
   * Pesos earned on this product. Zero until its target is reached, then the
   * discount applies to EVERY unit of it bought in the month, including those
   * bought before the target was crossed — the owner's rule, and what a volume
   * target usually means to the customer being offered one.
   */
  earned: number;
}

/** One line in the customer picker beside the product grid. */
export interface CustomerTargetSummaryRow {
  customerId: string;
  customerName: string;
  /** Products with a target set for this month. 0 for most customers. */
  targetedCount: number;
  /** How many of those they have reached. */
  reachedCount: number;
}

/**
 * Units bought per customer PER PRODUCT in a month, across EVERY outlet.
 *
 * Company-wide on purpose: the agreement is with the customer, and PILI and
 * CADLAN share pooled profit, so a tank bought at either one is a tank bought.
 * Filtering by branch would let a customer miss a target they actually hit by
 * splitting their orders between the two.
 *
 * Still gated on category even though rows are per product: a product name can
 * exist under more than one category (a `cylinder_deposit` named after the
 * cylinder it secures), and counting a refundable deposit toward a cylinder
 * target would report an unearned discount. The categories come from
 * targetProductScope, so they are exactly the ones the products are sold in.
 *
 * Shared by the Target Volume page and the Record Sale flag so the two can
 * never disagree about whether someone has reached their target — two copies of
 * this scan is exactly how one screen ends up saying "reached" while the other
 * says "6 to go".
 */
function volumeByCustomerProduct(
  saleTransactions: SaleTransaction[],
  month: string,
  countedCategories: string[],
): Map<string, Map<string, number>> {
  const volumes = new Map<string, Map<string, number>>();
  const counted = new Set(countedCategories);
  // Empty counts NOTHING. It can only happen when the catalog has no sale
  // sections at all, and returning early keeps that rule in one place rather
  // than relying on every caller to check.
  if (counted.size === 0) return volumes;

  const { start, end } = monthBounds(month);
  for (const sale of saleTransactions) {
    if (!sale.date || sale.date < start || sale.date > end) continue;
    if (!sale.customerId) continue;
    if (!counted.has(categoryOf(sale))) continue;
    const product = sale.product || "";
    if (!product) continue;

    let byProduct = volumes.get(sale.customerId);
    if (!byProduct) {
      byProduct = new Map<string, number>();
      volumes.set(sale.customerId, byProduct);
    }
    byProduct.set(product, (byProduct.get(product) || 0) + saleUnits(sale));
  }
  return volumes;
}

export interface BuildProductTargetRowsInput {
  customerId: string;
  /**
   * Every sellable product, in display order — see targetProductScope. The grid
   * lists all of them so a target can be set on any product before the customer
   * has ever bought it.
   */
  products: string[];
  /** Every target, all months — filtered to `month` here. */
  targets: CustomerTarget[];
  /** Sales spanning at least the month; anything outside it is ignored here. */
  saleTransactions: SaleTransaction[];
  month: string;
  /** Categories a sale must be in to count — see targetProductScope. */
  countedCategories: string[];
}

/**
 * One row per product for ONE customer — the right-hand grid.
 *
 * Products carrying a target for this customer are included even when they are
 * NOT in `products` — which happens when a product is renamed or retired from
 * the catalog after a target was agreed. Dropping those rows would hide a live
 * agreement while still leaving its document in Firestore for the Record Sale
 * banner to act on — an agreement nobody can see is worse than one sitting at
 * the bottom of the list.
 */
export function buildProductTargetRows({
  customerId,
  products,
  targets,
  saleTransactions,
  month,
  countedCategories,
}: BuildProductTargetRowsInput): ProductTargetRow[] {
  const mine = productTargetsIn(targets, month).filter((t) => t.customerId === customerId);
  const targetByProduct = new Map(mine.map((t) => [t.product as string, t]));
  const volumes = volumeByCustomerProduct(saleTransactions, month, countedCategories)
    .get(customerId) || new Map<string, number>();

  const names = [...products];
  const listed = new Set(products);
  for (const product of targetByProduct.keys()) {
    if (!listed.has(product)) names.push(product);
  }

  return names.map((product) => {
    const target = targetByProduct.get(product);
    const targetQty = Number(target?.targetQty) || 0;
    const discountPerUnit = Number(target?.discountPerUnit) || 0;
    const actualQty = volumes.get(product) || 0;
    // A target of zero is not a target reached — it is a row nobody has filled
    // in, and treating it as met would report an unearned discount on every
    // product on the list.
    const reached = targetQty > 0 && actualQty >= targetQty;
    return {
      product,
      hasTarget: !!target,
      targetQty,
      discountPerUnit,
      actualQty,
      reached,
      remaining: reached ? 0 : Math.max(0, targetQty - actualQty),
      earned: reached ? actualQty * discountPerUnit : 0,
    };
  });
}

export interface BuildCustomerSummaryInput {
  /** Every customer — the picker lists all of them, targets or not. */
  customers: Customer[];
  targets: CustomerTarget[];
  saleTransactions: SaleTransaction[];
  month: string;
  countedCategories: string[];
}

/**
 * One row per CUSTOMER for the picker — every customer, whether or not they
 * have an agreement.
 *
 * Listing everyone removes a mode: there is no difference between creating a
 * target and editing one, so nobody has to know which they are doing. The two
 * counts are what makes a 500-name list navigable — they mark the handful of
 * customers who actually have agreements.
 *
 * Alphabetical, and only alphabetical: this list is searched by name, so the
 * position of a row must not move because someone bought something.
 */
export function buildCustomerTargetSummaries({
  customers,
  targets,
  saleTransactions,
  month,
  countedCategories,
}: BuildCustomerSummaryInput): CustomerTargetSummaryRow[] {
  const monthTargets = productTargetsIn(targets, month).filter((t) => Number(t.targetQty) > 0);
  const volumes = volumeByCustomerProduct(saleTransactions, month, countedCategories);

  const byCustomer = new Map<string, CustomerTarget[]>();
  for (const t of monthTargets) {
    const list = byCustomer.get(t.customerId);
    if (list) list.push(t);
    else byCustomer.set(t.customerId, [t]);
  }

  // Names come from the customers collection itself, never from a name copied
  // onto the target document when it was created — renaming a customer cascades
  // everywhere else in this app, and a stale copy here would read as a second,
  // untargeted customer.
  const rows = customers.map((customer) => {
    const mine = byCustomer.get(customer.id) || [];
    const bought = volumes.get(customer.id);
    return {
      customerId: customer.id,
      customerName: customer.name,
      targetedCount: mine.length,
      reachedCount: mine.filter(
        (t) => (bought?.get(t.product as string) || 0) >= Number(t.targetQty),
      ).length,
    };
  });

  rows.sort((a, b) => a.customerName.localeCompare(b.customerName));
  return rows;
}

/**
 * The product grid's footer count. No peso total: a sum of discounts earned
 * across products is a figure nobody can check against anything on this screen.
 */
export function summarizeProductTargets(rows: ProductTargetRow[]): {
  targetedCount: number;
  reachedCount: number;
} {
  const targeted = rows.filter((r) => r.targetQty > 0);
  return {
    targetedCount: targeted.length,
    reachedCount: targeted.filter((r) => r.reached).length,
  };
}

/**
 * Every (customer, product) target for one month, indexed for cell-by-cell
 * lookup — what the Volume Per Customer grid tags its cells from.
 *
 * ONE scan of the sales for the whole index, rather than customerTargetStatuses
 * per row: that grid runs to hundreds of customers, and calling a per-customer
 * function on each would re-walk every sale document once per row.
 *
 * Deliberately built from the SAME volume scan as the Target Volume screen, so
 * the two can never disagree about who reached what. That matters more here than
 * anywhere else: the grid's own cells are a different figure — they are per
 * product AND TYPE, they honour the outlet filter, and they count with `|| 0`
 * where saleUnits() counts a missing quantity as 1. Tagging from the cells would
 * produce a "reached" that Target Volume contradicts, with nothing on either
 * screen explaining which is right.
 */
/** The one place a CustomerTargetStatus is assembled from a target plus a count. */
function statusFrom(target: CustomerTarget, month: string, actualQty: number): CustomerTargetStatus {
  const targetQty = Number(target.targetQty) || 0;
  const discountPerUnit = Number(target.discountPerUnit) || 0;
  const reached = actualQty >= targetQty;
  return {
    month,
    product: target.product as string,
    targetQty,
    discountPerUnit,
    actualQty,
    reached,
    remaining: reached ? 0 : Math.max(0, targetQty - actualQty),
    earned: reached ? actualQty * discountPerUnit : 0,
  };
}

export function buildTargetStatusIndex({
  targets,
  saleTransactions,
  month,
  countedCategories,
}: {
  targets: CustomerTarget[];
  saleTransactions: SaleTransaction[];
  month: string;
  countedCategories: string[];
}): Map<string, CustomerTargetStatus> {
  const index = new Map<string, CustomerTargetStatus>();
  const mine = productTargetsIn(targets, month).filter((t) => Number(t.targetQty) > 0);
  if (mine.length === 0) return index;

  const volumes = volumeByCustomerProduct(saleTransactions, month, countedCategories);

  for (const target of mine) {
    const product = target.product as string;
    const actualQty = volumes.get(target.customerId)?.get(product) || 0;
    index.set(`${target.customerId}|${product}`, statusFrom(target, month, actualQty));
  }
  return index;
}

export interface CustomerTargetStatus {
  month: string;
  product: string;
  targetQty: number;
  discountPerUnit: number;
  actualQty: number;
  reached: boolean;
  remaining: number;
  earned: number;
}

/**
 * One customer's standing on every product they have a target for this month,
 * or an empty list when they have none — which is the common case, so callers
 * render nothing.
 *
 * A LIST, not one status, because targets are per product now: returning a
 * single one would mean picking a product arbitrarily and labelling it as "the"
 * target, which is how Record Sale would end up reporting one product's
 * progress against another product's agreement.
 *
 * This is what Record Sale shows. It is INFORMATION ONLY: the operator still
 * types the discount by hand, so a wrong target here can mislead someone but
 * cannot by itself mis-price a sale.
 */
export function customerTargetStatuses({
  customerId,
  targets,
  saleTransactions,
  month,
  countedCategories,
}: {
  customerId: string;
  targets: CustomerTarget[];
  saleTransactions: SaleTransaction[];
  month: string;
  countedCategories: string[];
}): CustomerTargetStatus[] {
  if (!customerId) return [];
  const mine = productTargetsIn(targets, month)
    .filter((t) => t.customerId === customerId && Number(t.targetQty) > 0);
  if (mine.length === 0) return [];

  const volumes = volumeByCustomerProduct(saleTransactions, month, countedCategories)
    .get(customerId) || new Map<string, number>();

  return mine
    .map((target) => statusFrom(target, month, volumes.get(target.product as string) || 0))
    .sort((a, b) => a.product.localeCompare(b.product));
}
