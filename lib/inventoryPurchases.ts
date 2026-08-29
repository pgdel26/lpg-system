import type { Purchase } from "./types";

// ---------------------------------------------------------------------------
// Purchase quantities per section+product, for the inventory grid.
//
// Extracted from AppDataProvider when a transfer was found moving EMPTY
// cylinders that never moved. A transfer writes a purchases document at each
// outlet — negative at the source, positive at the destination (recordTransfer
// in usePurchasesData.ts) — and those documents were being counted the same as
// a real delivery from the planta.
//
// That is right for the FULL section: a transfer out really does reduce the
// fulls on hand. It is wrong for EMPTY, which counts the empties handed OVER to
// the planta in exchange. Moving cylinders between our own outlets exchanges
// nothing, so `excludeTransfers` exists for that one column.
//
// Pure module: no hooks, no Firestore.
// ---------------------------------------------------------------------------

type CountablePurchase = Pick<
  Purchase, "purchaseSection" | "product" | "quantity" | "isTransfer"
>;

/**
 * `{ [purchaseSection]: { [product]: totalQty } }` for a set of purchase
 * documents. Quantities are summed as written, so a transfer's negative
 * quantity at the source outlet subtracts.
 */
export function purchaseCountsBySection(
  docs: CountablePurchase[],
  options: { excludeTransfers?: boolean } = {},
): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const t of docs) {
    if (options.excludeTransfers && t.isTransfer) continue;
    if (!counts[t.purchaseSection]) counts[t.purchaseSection] = {};
    counts[t.purchaseSection][t.product] =
      (counts[t.purchaseSection][t.product] || 0) + (t.quantity || 0);
  }
  return counts;
}
