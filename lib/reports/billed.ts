import type { SaleTransaction, Swap, Refund } from "../types";

// ---------------------------------------------------------------------------
// The ONE definition of what a document contributes to billed revenue.
//
// This rule was about to exist in three places (the Reports customer-order
// matrix, the dashboard's Net Sales card, and implicitly inside
// computeIncomeStatement). Two copies of a money rule is how a report starts
// disagreeing with the screen next to it, so it lives here and callers add up
// whatever subset of documents they care about.
//
//   sale    + totalAmount   already net of discount AND already inclusive of
//                           deliveryCharge — see the line computation in
//                           useSalesData (lineSubtotal - lineDiscount +
//                           lineDelivery). Adding deliveryCharge on top would
//                           double-count it, and deliveryCharge is only written
//                           to the FIRST line of a multi-item sale, so the
//                           error would be inconsistent as well as wrong.
//   swap    + price         a swap is money received.
//   refund  - totalRefund   money going back out.
//
// Everything is returned in integer centavos. Sum in centavos and divide once
// at the end: a long column of .50s accumulated as floats drifts, and these
// figures get reconciled against the Income Statement to the centavo.
//
// This matches the Income Statement's `netRevenue` (gross + swaps + delivery
// − discounts − refunds). It deliberately does NOT match salesReport.ts's
// `netSales`, which additionally subtracts expenses because it answers a
// different question — what the operator must remit. Anything labelled with
// this rule must say "before expenses" if there is any chance of confusion.
//
// Pure module: no lib/hooks imports, so the cron route can reach it.
// ---------------------------------------------------------------------------

const toCentavos = (n: number | undefined): number => Math.round((Number(n) || 0) * 100);

/** A sale line's contribution to billed revenue, in centavos. */
const saleBilledCentavos = (sale: Pick<SaleTransaction, "totalAmount">): number =>
  toCentavos(sale.totalAmount);

/** A swap's contribution to billed revenue, in centavos. */
const swapBilledCentavos = (swap: Pick<Swap, "price">): number =>
  toCentavos(swap.price);

/** A refund's contribution, in centavos. Negative — it reduces revenue. */
const refundBilledCentavos = (refund: Pick<Refund, "totalRefund">): number =>
  -toCentavos(refund.totalRefund);

/**
 * Net billed revenue in PESOS for whole lists of documents. Filter to the date
 * range / branch you want before calling — this applies no filtering of its own.
 */
export function netBilled(
  sales: Array<Pick<SaleTransaction, "totalAmount">>,
  swaps: Array<Pick<Swap, "price">>,
  refunds: Array<Pick<Refund, "totalRefund">>,
): number {
  let centavos = 0;
  for (const sale of sales) centavos += saleBilledCentavos(sale);
  for (const swap of swaps) centavos += swapBilledCentavos(swap);
  for (const refund of refunds) centavos += refundBilledCentavos(refund);
  return centavos / 100;
}
