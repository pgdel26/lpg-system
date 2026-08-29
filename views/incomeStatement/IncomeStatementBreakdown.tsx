import { useState } from "react";
import { fmt } from "../../lib/utils";
import { ChevronDownIcon } from "../../components/Icons";
import { expenseDisplayLabel } from "../../lib/expenses";
import { arMethodLabel } from "../../lib/receivables";
import type { IncomeStatementResult } from "../../lib/reports/incomeStatement";
import type { Staff } from "../../lib/types";
import styles from "./IncomeStatementBreakdown.module.css";

interface IncomeStatementBreakdownProps {
  result: IncomeStatementResult;
  /** Names salary expenses, whose own description is optional. */
  staff: Staff[];
  /**
   * True when viewing a single outlet's tab rather than "All Outlets".
   * Purchases are paid from shared/pooled profit across outlets (confirmed
   * business practice), not from each outlet's own till — so a purchase's
   * `branch` (which outlet the stock was booked to) isn't the same as which
   * drawer paid for it. That makes the per-outlet Net Cash Movement figure
   * unreliable; only the combined "All Outlets" total is.
   */
  isPerBranchView: boolean;
}

export default function IncomeStatementBreakdown({ result, staff, isPerBranchView }: IncomeStatementBreakdownProps) {
  const [expensesOpen, setExpensesOpen] = useState(false);

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Income Statement</div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>Gross Sales</div>
        <span className={`${styles.rowValue} ${result.grossSales > 0 ? styles.valueNeutral : styles.valueDim}`}>
          {fmt(result.grossSales)}
        </span>
      </div>

      <div className={styles.row}>
        <div>
          <div className={styles.rowLabel}>Delivery Charge</div>
          <div className={styles.rowSub}>{result.deliveryCount} delivery sale{result.deliveryCount !== 1 ? "s" : ""}</div>
        </div>
        <span className={`${styles.rowValue} ${result.deliveryRevenue > 0 ? styles.valueNeutral : styles.valueDim}`}>
          {result.deliveryRevenue > 0 ? `+ ${fmt(result.deliveryRevenue)}` : fmt(0)}
        </span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>Less: Discounts</div>
        <span className={`${styles.rowValue} ${result.totalDiscounts > 0 ? styles.valueRed : styles.valueDim}`}>
          {result.totalDiscounts > 0 ? `- ${fmt(result.totalDiscounts)}` : fmt(0)}
        </span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>Less: Refunds</div>
        <span className={`${styles.rowValue} ${result.totalRefunds > 0 ? styles.valueRed : styles.valueDim}`}>
          {result.totalRefunds > 0 ? `- ${fmt(result.totalRefunds)}` : fmt(0)}
        </span>
      </div>

      <div className={styles.row}>
        <div>
          <div className={styles.rowLabel}>Swap Fees</div>
          <div className={styles.rowSub}>{result.swapCount} swap{result.swapCount !== 1 ? "s" : ""}</div>
        </div>
        <span className={`${styles.rowValue} ${result.swapRevenue > 0 ? styles.valueNeutral : styles.valueDim}`}>
          {fmt(result.swapRevenue)}
        </span>
      </div>

      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Net Revenue</span>
        <span className={`${styles.totalValue} ${result.netRevenue >= 0 ? styles.valueGreen : styles.valueRed}`}>
          {fmt(result.netRevenue)}
        </span>
      </div>

      {result.totalTax > 0 && (
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Memo: Taxes billed</div>
            {/* Sits BELOW Net Revenue on purpose — it is not part of that
                total. Shown because the money is real and a reader reconciling
                against the day's takings needs the difference to have a name. */}
            <div className={styles.rowSub}>
              collected for the BIR on {result.taxCount} sale{result.taxCount !== 1 ? "s" : ""} — not revenue
            </div>
          </div>
          <span className={`${styles.rowValue} ${styles.valueDim}`}>{fmt(result.totalTax)}</span>
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.rowLabel}>Less: Cost of Purchases</div>
        <span className={`${styles.totalValue} ${result.totalCostOfPurchases > 0 ? styles.valueRed : styles.valueDim}`}>
          {result.totalCostOfPurchases > 0 ? `- ${fmt(result.totalCostOfPurchases)}` : fmt(0)}
        </span>
      </div>
      {result.uncostedDeliveryCount > 0 && (
        <div className={styles.cashMemo}>
          {result.uncostedDeliveryCount} deliver{result.uncostedDeliveryCount === 1 ? "y" : "ies"} received
          this period {result.uncostedDeliveryCount === 1 ? "has" : "have"} no cost entered yet, so this is a
          floor — Gross Profit AND Net Cash Movement below are both overstated until
          {result.uncostedDeliveryCount === 1 ? " it is" : " they are"} costed on the Purchases screen.
        </div>
      )}

      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Gross Profit</span>
        <span className={`${styles.totalValue} ${result.grossProfit >= 0 ? styles.valueGreen : styles.valueRed}`}>
          {fmt(result.grossProfit)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setExpensesOpen((v) => !v)}
        disabled={result.expenseItems.length === 0}
        className={styles.cardHeaderButton}
      >
        <div className={styles.rowLabel}>Less: Recorded Expenses</div>
        {result.expenseItems.length > 0 && (
          <div className={styles.rowValueGroup}>
            <span className={styles.rowSub}>{result.expenseItems.length} item{result.expenseItems.length !== 1 ? "s" : ""}</span>
            <span className={`${styles.expensesChevron} ${expensesOpen ? "" : styles.expensesChevronClosed}`}>
              <ChevronDownIcon />
            </span>
          </div>
        )}
      </button>

      {expensesOpen && result.expenseItems.map((e) => (
        <div key={e.id} className={styles.row}>
          <div className={styles.rowLabel}>{expenseDisplayLabel(e, staff)}</div>
          <span className={`${styles.rowValue} ${styles.valueRed}`}>{fmt(e.amount)}</span>
        </div>
      ))}

      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total Expenses</span>
        <span className={`${styles.totalValue} ${styles.valueRed}`}>{fmt(result.totalExpenses)}</span>
      </div>

      {/* Operating Result doubles as the opening line of the cash walk below
          — it already nets out Cost of Purchases (paid COD), Refunds, and
          Expenses, so nothing after this point re-subtracts them. All that's
          left to adjust for is: back out revenue that wasn't billed as cash
          (GCash, A/R), then add back A/R actually collected in cash this
          period (which can differ from what was billed this period, since a
          past invoice can be collected now). GCash and A/R are explicitly
          subtracted (rather than just never added) so it's visually obvious
          they're excluded — GCash is reconciled by a separate account. */}
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Operating Result (before shared costs)</span>
        <span className={`${styles.totalValue} ${result.operatingResult >= 0 ? styles.valueGreen : styles.valueRed}`}>
          {fmt(result.operatingResult)}
        </span>
      </div>

      {result.totalTax > 0 && (
        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>+ Taxes Collected</div>
            {/* In the walk, unlike above: the customer paid it, so it is in the
                drawer until it is remitted. Without this the walk would not
                foot and the day would read short by exactly the tax. */}
            <div className={styles.rowSub}>held for the BIR — money in, not earnings</div>
          </div>
          <span className={`${styles.rowValue} ${styles.valueNeutral}`}>
            + {fmt(result.totalTax)}
          </span>
        </div>
      )}

      {/* A/R collected this period, checks included. The channel lines beneath
          are informational — every one is already inside the figure above, and
          none is subtracted back out. A check is encashed to the bank, so it is
          money received, not money pending. */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>+ A/R Collected This Period</div>
        <span className={`${styles.rowValue} ${result.arCollectedTotal > 0 ? styles.valueNeutral : styles.valueDim}`}>
          {result.arCollectedTotal > 0 ? `+ ${fmt(result.arCollectedTotal)}` : fmt(0)}
        </span>
      </div>
      {result.arCollectedCash > 0 && (
        <div className={`${styles.row} ${styles.channelRow}`}>
          <div className={styles.channelLabel}>of which collected in cash</div>
          <span className={`${styles.rowValue} ${styles.valueDim}`}>{fmt(result.arCollectedCash)}</span>
        </div>
      )}
      {result.arCollectedCheck > 0 && (
        <div className={`${styles.row} ${styles.channelRow}`}>
          <div className={styles.channelLabel}>of which collected by check (encashed to bank)</div>
          <span className={`${styles.rowValue} ${styles.valueDim}`}>{fmt(result.arCollectedCheck)}</span>
        </div>
      )}
      {result.arCollectedGcash > 0 && (
        <div className={`${styles.row} ${styles.channelRow}`}>
          <div className={styles.channelLabel}>of which collected via {arMethodLabel("gcash")}</div>
          <span className={`${styles.rowValue} ${styles.valueDim}`}>{fmt(result.arCollectedGcash)}</span>
        </div>
      )}

      {/* The other half of the A/R movement. This period's credit sales sit in
          Operating Result as revenue, but no money arrived for them — so they
          come out here, and what was actually collected went in above. */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>Less: A/R (credit sales this period, not yet received)</div>
        <span className={`${styles.rowValue} ${result.salesAr > 0 ? styles.valueRed : styles.valueDim}`}>
          {result.salesAr > 0 ? `- ${fmt(result.salesAr)}` : fmt(0)}
        </span>
      </div>

      {/* The headline figure of the page, set larger than every other total so
          it reads as the answer rather than one more subtotal. Its caveats live
          on netCashMovement's field comment and in the Excel export, not here —
          on-screen notes were going unread. */}
      <div className={styles.finalTotalRow}>
        <span className={styles.finalTotalLabel}>Net Cash Movement This Period</span>
        <span className={`${styles.finalTotalValue} ${result.netCashMovement >= 0 ? styles.valueGreen : styles.valueRed}`}>
          {fmt(result.netCashMovement)}
        </span>
      </div>
      {/* Repeated at the headline on purpose. Cost of Purchases feeds this figure
          through Operating Result, so an uncosted month overstates it by the whole
          month's purchase spend — millions of pesos — and this is the number the
          page presents as the answer. A caveat 200px further up is not where the
          eye lands. Conditional, so it is absent whenever it would be noise. */}
      {result.uncostedDeliveryCount > 0 && (
        <div className={styles.cashMemo}>
          Overstated: {result.uncostedDeliveryCount} deliver{result.uncostedDeliveryCount === 1 ? "y" : "ies"} this
          period still {result.uncostedDeliveryCount === 1 ? "has" : "have"} no cost entered, so that spend is
          missing from this figure.
        </div>
      )}
      {isPerBranchView && (
        <div className={styles.cashMemo}>
          Every purchase is recorded against the main outlet, so Cost of Purchases, Gross Profit and Net Cash Movement are not meaningful per outlet — a non-main outlet shows no cost at all and its margin reads far too high. Check &quot;All Outlets&quot; for the real figures.
        </div>
      )}

      {/* Memo, not components. These foot to Total Billed by construction and
          NOT to Net Cash Movement above — purchases and expenses have no payment
          channel, so that figure cannot be split this way. Labelled and totalled
          separately so the two are never read as one sum. */}
      <div className={styles.sectionTitle}>How This Period&apos;s Sales Were Billed</div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Cash</div>
        <span className={`${styles.rowValue} ${result.salesCash > 0 ? styles.valueNeutral : styles.valueDim}`}>{fmt(result.salesCash)}</span>
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>GCash</div>
        <span className={`${styles.rowValue} ${result.salesGcash > 0 ? styles.valueNeutral : styles.valueDim}`}>{fmt(result.salesGcash)}</span>
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>A/R (on credit)</div>
        <span className={`${styles.rowValue} ${result.salesAr > 0 ? styles.valueNeutral : styles.valueDim}`}>{fmt(result.salesAr)}</span>
      </div>
      <div className={styles.totalRow}>
        <div>
          <span className={styles.totalLabel}>Total Billed</span>
          {/* Says so here, because the Taxes memo is far above under Net
              Revenue: a reader adding Gross Sales + Delivery − Discounts and
              comparing to this figure is otherwise off by exactly the tax, with
              nothing nearby naming the difference. */}
          {result.totalTax > 0 && (
            <div className={styles.rowSub}>includes {fmt(result.totalTax)} tax billed</div>
          )}
        </div>
        <span className={styles.totalValue}>{fmt(result.totalBilled)}</span>
      </div>
      {/* The detector, not an explainer — it renders only when the two sides of
          the identity actually disagree, and Net Cash Movement is wrong by the
          same amount when they do. */}
      {Math.abs(result.billingIdentityGap) > 0.01 && (
        <div className={styles.cashMemo}>
          {fmt(Math.abs(result.billingIdentityGap))} {result.billingIdentityGap > 0 ? "more" : "less"} than
          this period&apos;s sales revenue — a few legacy records predate the per-sale payment breakdown.
          Net Cash Movement is off by the same amount.
        </div>
      )}
    </div>
  );
}
