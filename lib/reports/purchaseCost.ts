import type { Purchase, PurchaseDelivery } from "../types";

/**
 * The one rule for "what did purchases cost", across two eras of data.
 *
 * Historically the operator typed a unit cost per product line, so cost lives on
 * each `purchases` doc as `totalCost`. In practice they never know the itemized
 * amounts at purchase time — the supplier bills a delivery total and itemizes a
 * month later if at all — which is why every June and August 2026 line sits at 0
 * while July's real figures were entered once, on the 31st. Purchases recorded
 * from now on carry quantity only, and the amount payable lives on one
 * `purchaseDelivery` doc that the lines point at via `deliveryId`.
 *
 * Rule: a delivery's cost comes from its `purchaseDelivery` doc, and the line
 * costs of any doc carrying a `deliveryId` are ignored. Lines with no
 * `deliveryId` fall back to their own `totalCost`. Exactly one source per
 * delivery, so nothing double counts — and July's ₱5.2M keeps reporting with no
 * migration.
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
  };
}
