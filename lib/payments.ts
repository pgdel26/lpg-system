// Single shared implementation of "how much of this sale doc is Cash/GCash/AR."
// Every report that breaks sales down by payment channel (Sales Report,
// Daily Sales tab, Receivables, Top Debtors) must call this instead of
// re-deriving the rule — see the safe-category-change-style warning this
// avoids: before this existed, the channel rule was duplicated 3 times and
// a split-payment sale would have been silently booked as 100% A/R by the
// `paymentType !== "cash" && !== "gcash"` fallback in each copy.
//
// Structurally typed (not against SaleTransaction) so it also works from
// lib/reports/salesReport.ts, which is called from the admin-SDK cron route
// with plain objects typed by its own local ReportSaleTransaction interface.
export interface PaymentSplitLike {
  paymentType?: string;
  totalAmount?: number;
  finalPrice?: number;
  payments?: Array<{ method?: string; amount?: number }>;
}

export interface PaymentSplit {
  cash: number;
  gcash: number;
  ar: number;
}

export function paymentSplit(t: PaymentSplitLike): PaymentSplit {
  if (t.payments && t.payments.length > 0) {
    const split: PaymentSplit = { cash: 0, gcash: 0, ar: 0 };
    for (const p of t.payments) {
      const amount = p.amount || 0;
      if (p.method === "cash") split.cash += amount;
      else if (p.method === "gcash") split.gcash += amount;
      else split.ar += amount; // unknown/other methods fall into A/R, matching the legacy rule below
    }
    return split;
  }

  // Legacy fallback for docs with no `payments` array — reproduces today's
  // behavior (including the totalAmount||finalPrice quirk) exactly, so
  // historical reports don't change.
  const amount = t.totalAmount || t.finalPrice || 0;
  if (t.paymentType === "cash") return { cash: amount, gcash: 0, ar: 0 };
  if (t.paymentType === "gcash") return { cash: 0, gcash: amount, ar: 0 };
  return { cash: 0, gcash: 0, ar: amount };
}
