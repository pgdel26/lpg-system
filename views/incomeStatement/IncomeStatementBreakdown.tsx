import { useState } from "react";
import { fmt } from "../../lib/utils";
import { ChevronDownIcon } from "../../components/Icons";
import type { IncomeStatementResult } from "../../lib/reports/incomeStatement";
import styles from "./IncomeStatementBreakdown.module.css";

interface IncomeStatementBreakdownProps {
  result: IncomeStatementResult;
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

export default function IncomeStatementBreakdown({ result, isPerBranchView }: IncomeStatementBreakdownProps) {
  const [expensesOpen, setExpensesOpen] = useState(false);
  // Any A/R collected this period via GCash or check — broken out separately
  // so those channels can be subtracted back out before the final cash
  // total, instead of appearing in a memo section after it.
  const arCollectedOther = result.arCollectedGcash + result.arCollectedCheck;
  const hasCashReconciliationGap = Math.abs(result.cashReconciliationGap) > 0.01;

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

      <div className={styles.row}>
        <div>
          <div className={styles.rowLabel}>Less: Cost of Purchases</div>
          <div className={styles.rowSub}>Stock bought this period, not adjusted for opening/closing inventory</div>
        </div>
        <span className={`${styles.rowValue} ${result.totalCostOfPurchases > 0 ? styles.valueRed : styles.valueDim}`}>
          {result.totalCostOfPurchases > 0 ? `- ${fmt(result.totalCostOfPurchases)}` : fmt(0)}
        </span>
      </div>
      {result.hasTransferActivity && (
        <div className={styles.cashMemo}>
          Stock transferred in: {result.transferInQty} · out: {result.transferOutQty} (units, not valued).
          {isPerBranchView
            ? " Transferred stock is zero-cost here, so this outlet's Gross Profit may be overstated (if received) or understated (if sent) by the transferred amount."
            : " Nets to zero cost company-wide."}
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
          <div className={styles.rowLabel}>{e.description}</div>
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
      <div className={styles.cashMemo}>
        Starting from Operating Result above: cash movements only, not a running balance. Assumes swap fees and expenses are settled in cash.
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>Less: GCash</div>
        <span className={`${styles.rowValue} ${result.salesGcash > 0 ? styles.valueRed : styles.valueDim}`}>
          {result.salesGcash > 0 ? `- ${fmt(result.salesGcash)}` : fmt(0)}
        </span>
      </div>
      <div className={styles.row}>
        <div className={styles.rowLabel}>Less: A/R (credit sales)</div>
        <span className={`${styles.rowValue} ${result.salesAr > 0 ? styles.valueRed : styles.valueDim}`}>
          {result.salesAr > 0 ? `- ${fmt(result.salesAr)}` : fmt(0)}
        </span>
      </div>

      {/* A/R collected this period — always shown as its own line (how much
          came back in on credit sales this month), broken out by channel so
          GCash/check collections are subtracted back out BEFORE the final
          cash total instead of appearing in a memo section below it. */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>+ A/R Collected This Period</div>
        <span className={`${styles.rowValue} ${result.arCollectedCash + arCollectedOther > 0 ? styles.valueNeutral : styles.valueDim}`}>
          {fmt(result.arCollectedCash + arCollectedOther)}
        </span>
      </div>
      {result.arCollectedGcash > 0 && (
        <div className={`${styles.row} ${styles.channelRow}`}>
          <div className={styles.channelLabel}>Less: collected via GCash</div>
          <span className={`${styles.rowValue} ${styles.valueRed}`}>- {fmt(result.arCollectedGcash)}</span>
        </div>
      )}
      {result.arCollectedCheck > 0 && (
        <div className={`${styles.row} ${styles.channelRow}`}>
          <div className={styles.channelLabel}>Less: collected by check (to deposit, not in drawer)</div>
          <span className={`${styles.rowValue} ${styles.valueRed}`}>- {fmt(result.arCollectedCheck)}</span>
        </div>
      )}
      {/* Only shown when there's an actual channel split to resolve —
          otherwise this would be the exact same figure as "+ A/R Collected
          This Period" above, reading as a duplicate rather than a subtotal. */}
      {arCollectedOther > 0 && (
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>A/R Collected in Cash</span>
          <span className={`${styles.totalValue} ${result.arCollectedCash > 0 ? styles.valueGreen : styles.valueNeutral}`}>
            {fmt(result.arCollectedCash)}
          </span>
        </div>
      )}

      {/* The bottom line of the whole page — nothing renders after this
          total, so any exclusion the reader needs is attached directly below
          it rather than in a separate memo section further down. */}
      <div className={styles.finalTotalRow}>
        <div>
          <span className={styles.finalTotalLabel}>Net Cash Movement This Period</span>
          <div className={styles.finalTotalSub}>
            Physical cash only, from this period&apos;s activity — GCash and checks not included.
            Net of stock purchases (paid COD) — differs from the Sales Report&apos;s Expected Cash Remit, which excludes purchases.
          </div>
        </div>
        <span className={`${styles.finalTotalValue} ${result.netCashMovement >= 0 ? styles.valueGreen : styles.valueRed}`}>
          {fmt(result.netCashMovement)}
        </span>
      </div>
      {isPerBranchView && (
        <div className={styles.cashMemo}>
          Purchases are paid from shared profit across outlets, not this outlet&apos;s own till — Net Cash Movement isn&apos;t reliable per outlet. Check &quot;All Outlets&quot; for the real total.
        </div>
      )}
      {hasCashReconciliationGap && (
        <div className={styles.cashMemo}>
          The rows above sum to {fmt(result.cashBuildUp)}, {result.cashReconciliationGap > 0 ? "short of" : "over"} the total by {fmt(Math.abs(result.cashReconciliationGap))} — from a small number of older sales records saved before this app tracked a full payment breakdown per sale.
        </div>
      )}
    </div>
  );
}
