import type { Purchase, PurchaseDailyCost } from "../types";

/**
 * The one rule for "what did purchases cost", across two eras of data.
 *
 * Historically the operator typed a unit cost per product line, so cost lives on
 * each `purchases` doc as `totalCost`. In practice they never know the itemized
 * amounts at purchase time — the supplier only bills a total, itemized a month
 * later if at all — which is why every June and August 2026 line sits at 0 while
 * July's real figures were entered once, on the 31st. Purchases recorded from
 * now on carry quantity only, and the amount payable for the day's delivery
 * lives in one `purchaseDailyCost` doc per date+branch.
 *
 * Rule: for each (date, branch), a `purchaseDailyCost` doc WINS and the line
 * costs for that day are ignored; where no such doc exists, fall back to summing
 * that day's line `totalCost`. Exactly one source per day, so nothing can be
 * double counted — and July's ₱5.2M keeps reporting correctly with no migration.
 *
 * Transfers are excluded here rather than by the caller: they are recorded in the
 * same collection at zero cost (see recordTransfer) and are not purchases.
 *
 * Both arrays must already be narrowed to the period and branch being reported.
 */
export interface PurchaseCostBreakdown {
  total: number;
  /** Portion taken from purchaseDailyCost docs (the current model). */
  fromDailyTotals: number;
  /** Portion summed from per-line costs on days with no daily doc (historical). */
  fromLineCosts: number;
  /** Days whose cost came from a daily doc — for "N deliveries" style captions. */
  dailyTotalDays: number;
}

const dayKey = (date?: string, branch?: string) => `${date || ""}|${branch || ""}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function purchaseCost(
  purchases: Purchase[],
  dailyCosts: PurchaseDailyCost[],
): PurchaseCostBreakdown {
  const daily = new Map<string, number>();
  for (const d of dailyCosts) {
    // Same day recorded twice would be a doc-id collision, so this is a plain
    // overwrite rather than an accumulate — the id is `{date}_{branch}`.
    daily.set(dayKey(d.date, d.branch), d.totalCost || 0);
  }

  const fromDailyTotals = Array.from(daily.values()).reduce((s, v) => s + v, 0);
  const fromLineCosts = purchases
    .filter((p) => !p.isTransfer && !daily.has(dayKey(p.date, p.branch)))
    .reduce((s, p) => s + (p.totalCost || 0), 0);

  return {
    total: round2(fromDailyTotals + fromLineCosts),
    fromDailyTotals: round2(fromDailyTotals),
    fromLineCosts: round2(fromLineCosts),
    dailyTotalDays: daily.size,
  };
}
