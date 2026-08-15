import { useState } from "react";
import { fmt } from "../../lib/utils";
import type { IncomeStatementResult } from "../../lib/reports/incomeStatement";
import styles from "./IncomeStatementBreakdown.module.css";

export default function IncomeStatementBreakdown({ result }: { result: IncomeStatementResult }) {
  const [expensesOpen, setExpensesOpen] = useState(false);

  return (
    <>
      {/* Revenue */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Revenue</div>

        {result.revenueLines.map((line) => (
          <div key={line.label} className={styles.row}>
            <div>
              <div className={styles.rowLabel}>{line.label}</div>
              <div className={styles.rowSub}>{line.count} sale{line.count !== 1 ? "s" : ""}</div>
            </div>
            <span className={`${styles.rowValue} ${styles.valueGreen}`}>{fmt(line.amount)}</span>
          </div>
        ))}

        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Swap Fees</div>
            <div className={styles.rowSub}>{result.swapCount} swap{result.swapCount !== 1 ? "s" : ""}</div>
          </div>
          <span className={`${styles.rowValue} ${result.swapRevenue > 0 ? styles.valueGreen : styles.valueDim}`}>
            {fmt(result.swapRevenue)}
          </span>
        </div>

        <div className={styles.subTotalRow}>
          <span className={styles.subTotalLabel}>Gross Sales</span>
          <span className={styles.subTotalValue}>{fmt(result.grossSales)}</span>
        </div>

        <div className={styles.row}>
          <div>
            <div className={styles.rowLabel}>Delivery Charge</div>
            <div className={styles.rowSub}>{result.deliveryCount} delivery sale{result.deliveryCount !== 1 ? "s" : ""}</div>
          </div>
          <span className={`${styles.rowValue} ${result.deliveryRevenue > 0 ? styles.valueGreen : styles.valueDim}`}>
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

        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Net Revenue</span>
          <span className={`${styles.totalValue} ${result.netRevenue >= 0 ? styles.valueGreen : styles.valueRed}`}>
            {fmt(result.netRevenue)}
          </span>
        </div>
      </div>

      {/* Cost of Purchases */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Cost of Purchases</div>
        <div className={styles.cardNote}>
          Stock bought this period, not adjusted for opening/closing inventory — a month with heavy
          cylinder restocking will look worse than it was. Excludes stock moved between outlets via
          Transfer Stock (zero cost, shown below).
        </div>

        {result.costLines.length > 0 ? result.costLines.map((line) => (
          <div key={line.label} className={styles.row}>
            <div>
              <div className={styles.rowLabel}>{line.label}</div>
              <div className={styles.rowSub}>{line.count} purchase{line.count !== 1 ? "s" : ""}</div>
            </div>
            <span className={`${styles.rowValue} ${styles.valueRed}`}>{fmt(line.amount)}</span>
          </div>
        )) : (
          <div className={styles.rowEmpty}>No purchases recorded.</div>
        )}

        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Total Cost of Purchases</span>
          <span className={`${styles.totalValue} ${styles.valueRed}`}>{fmt(result.totalCostOfPurchases)}</span>
        </div>

        {result.hasTransferActivity && (
          <div className={styles.transferMemoRow}>
            <span>Stock transferred (units, not valued)</span>
            <span>in: {result.transferInQty} · out: {result.transferOutQty}</span>
          </div>
        )}
      </div>

      {/* Gross Profit */}
      <div className={styles.grossProfitBar}>
        <div>
          <span className={styles.totalLabel}>Gross Profit</span>
          <span className={styles.marginBadge}>
            {result.grossMarginPct === null
              ? "— margin"
              : `${result.grossMarginPct.toFixed(1)}% margin${result.hasTransferActivity ? "*" : ""}`}
          </span>
        </div>
        <span className={`${styles.totalValue} ${result.grossProfit >= 0 ? styles.valueGreen : styles.valueRed}`}>
          {fmt(result.grossProfit)}
        </span>
      </div>
      {result.hasTransferActivity && (
        <div className={styles.marginFootnote}>
          * includes zero-cost stock transferred between outlets — margin may not reflect true cost
        </div>
      )}

      {/* Expenses */}
      <div className={styles.card}>
        <div className={styles.cardHeaderRow}>
          <div className={styles.cardTitle}>Recorded Expenses</div>
          {result.expenseItems.length > 0 && (
            <button className={styles.toggleButton} onClick={() => setExpensesOpen((v) => !v)}>
              {expensesOpen ? "Hide" : "Show"} {result.expenseItems.length} item{result.expenseItems.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>

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
      </div>

      {/* Operating Result */}
      <div className={styles.operatingResultBar}>
        <span className={styles.operatingResultLabel}>Operating Result (before shared costs)</span>
        <span className={`${styles.operatingResultValue} ${result.operatingResult >= 0 ? styles.valueGreen : styles.valueRed}`}>
          {fmt(result.operatingResult)}
        </span>
      </div>
    </>
  );
}
