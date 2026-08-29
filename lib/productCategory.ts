import type { SaleTransaction } from "./types";

// ---------------------------------------------------------------------------
// The two rules every "how much was sold" calculation has to agree on.
//
// Extracted from lib/reports/productSales.ts when the customer target-volume
// feature needed the same two answers. Copying them would have been the
// cheaper edit and the wrong one: the Target Volume page's "actual" and the
// Monthly Sales report's quantity are the SAME figure shown twice, and the
// first time the two copies drifted, one screen would say a customer hit their
// target while the other said they didn't — with nothing on either screen
// explaining which was right.
//
// Pure module: no hooks, no Firestore, no xlsx. Importable from the cron route
// (see the lib/* server-reachable rule in CLAUDE.md) — which is also why this
// does NOT live in lib/reports/productSales.ts, whose xlsx import would come
// along with it.
// ---------------------------------------------------------------------------

/**
 * Sale sections that represent a cylinder. Used ONLY to derive a category for a
 * legacy document that predates `productCategory`; nothing is included or
 * excluded on the basis of this list.
 */
const CYLINDER_SECTIONS = ["refill", "cylinderWithRefill"];

/**
 * The category a sale document belongs to. Falls back to the sale section for
 * old documents with no `productCategory`: a single-price section's key IS its
 * category (see buildSalesSections), and the two cylinder sections both mean
 * "cylinder". Without this a product would split across two categories
 * depending on which documents happened to carry the field.
 */
export const categoryOf = (
  sale: Pick<SaleTransaction, "productCategory" | "saleSection">,
): string => {
  if (sale.productCategory) return sale.productCategory;
  const section = sale.saleSection || "";
  return CYLINDER_SECTIONS.includes(section) ? "cylinder" : section;
};

/**
 * Units moved by one sale document.
 *
 * `|| 1`, NOT `|| 0`, and deliberately so: every money and inventory consumer
 * of this field treats a missing quantity as one unit (salesReport.ts's
 * grossSales, incomeStatement.ts's gross, useSalesData's inventory SOLD feed).
 * A handful of legacy documents predate the field, and counting them as zero
 * here while the Income Statement prices them as one is a discrepancy with no
 * visible cause. Today's writer always writes a quantity of at least 1, so this
 * can never swallow a genuine zero.
 *
 * NOTE: lib/reports/customerOrders.ts and lib/reports/dashboard.ts still spell
 * this `|| 0` inline and therefore disagree with everything else. Left alone
 * here — changing what those two screens report is its own decision, not a
 * side effect of adding target volumes — but they are the reason this helper
 * exists rather than a fourth inline copy.
 */
export const saleUnits = (sale: Pick<SaleTransaction, "quantity">): number =>
  Number(sale.quantity) || 1;
