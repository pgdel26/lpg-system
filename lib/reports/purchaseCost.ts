import type { Purchase, PurchaseDelivery } from "../types";

/**
 * The one rule for "what did purchases cost", across two eras of data.
 *
 * Historically the operator typed a unit cost per product line, so cost lived on
 * each `purchases` doc as `totalCost`. In practice they never know the itemized
 * amounts at purchase time — the supplier bills a delivery total and itemizes a
 * month later if at all — which is why March through June and August 2026 sat
 * entirely at 0 while only July's figures were ever entered. Purchases carry
 * quantity only, and the amount payable lives on one `purchaseDelivery` doc that
 * the lines point at via `deliveryId`.
 *
 * Rule: a delivery's cost comes from its `purchaseDelivery` doc, and the line
 * costs of any doc carrying a `deliveryId` are ignored. Lines with no
 * `deliveryId` fall back to their own `totalCost`. Exactly one source per
 * delivery, so nothing double counts.
 *
 * scripts/backfill-purchase-deliveries.mjs moved all 570 historical lines onto
 * deliveries, so `fromLineCosts` should now be 0 for every period — the fallback
 * stays because a doc written before it ran, or restored from a backup, would
 * otherwise report as free stock.
 *
 * A delivery with `costPending` has no cost entered yet. Its `totalCost` of 0 is a
 * placeholder, so it contributes nothing to the total but is counted separately:
 * a caller showing "₱0.00" where the truth is "nobody has entered this" is how a
 * month stays uncosted without anyone noticing.
 *
 * Transfers are excluded here rather than by the caller: they are recorded in the
 * same collection at zero cost (see recordTransfer) and are not purchases.
 *
 * Both arrays must already be narrowed to the period and branch being reported.
 * Deliveries are scoped by their own date/branch, not by their lines', so a
 * delivery whose lines fall outside the window cannot leak in.
 */
export interface PurchaseCostBreakdown {
  total: number;
  /** Portion taken from purchaseDelivery docs (the current model). */
  fromDeliveries: number;
  /** Portion summed from per-line costs on lines with no deliveryId (historical). */
  fromLineCosts: number;
  /** Number of deliveries counted — for "N deliveries" style captions. */
  deliveryCount: number;
  /** How many of those deliveries have no cost entered yet (`costPending`). When
   *  this is above 0 the total is a floor, not the real spend, and the caller
   *  must say so. */
  pendingCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function purchaseCost(
  purchases: Purchase[],
  deliveries: PurchaseDelivery[],
): PurchaseCostBreakdown {
  const fromDeliveries = deliveries.reduce((s, d) => s + (d.totalCost || 0), 0);
  const fromLineCosts = purchases
    .filter((p) => !p.isTransfer && !p.deliveryId)
    .reduce((s, p) => s + (p.totalCost || 0), 0);

  return {
    total: round2(fromDeliveries + fromLineCosts),
    fromDeliveries: round2(fromDeliveries),
    fromLineCosts: round2(fromLineCosts),
    deliveryCount: deliveries.length,
    pendingCount: deliveries.filter((d) => d.costPending).length,
  };
}
