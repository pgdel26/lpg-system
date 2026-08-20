import { useState, useMemo } from "react";
import { fmt, today } from "../../lib/utils";
import { monthBounds, monthLabel, monthOptions } from "../../lib/months";
import { arRollForward } from "../../lib/receivables";
import type { SaleTransaction } from "../../lib/types";
import styles from "./ArSummaryTab.module.css";

interface ArSummaryTabProps {
  arTransactions: SaleTransaction[];
}

export default function ArSummaryTab({ arTransactions }: ArSummaryTabProps) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const months = useMemo(
    () => monthOptions(arTransactions.map((t) => t.date), today().slice(0, 7)),
    [arTransactions],
  );
  const { start, end } = monthBounds(month);

  const rows = useMemo(
    () => arRollForward(arTransactions, start, end),
    [arTransactions, start, end],
  );

  // EPSILON-scale residue is not worth a warning; a real break is centavos or more.
  const driftRows = useMemo(() => rows.filter((r) => Math.abs(r.drift) > 0.005), [rows]);
  const totalDrift = useMemo(() => driftRows.reduce((s, r) => s + r.drift, 0), [driftRows]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      beginning: acc.beginning + r.beginning,
      added: acc.added + r.added,
      collected: acc.collected + r.collected,
      ending: acc.ending + r.ending,
    }),
    { beginning: 0, added: 0, collected: 0, ending: 0 },
  ), [rows]);

  return (
    <div className="animate-fade">
      <div className={styles.controls}>
        <label className={styles.controlLabel} htmlFor="ar-month">Period</label>
        <select
          id="ar-month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={styles.monthSelect}
        >
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span className={styles.controlHint}>{start} to {end}</span>
      </div>

      {/* Beginning + Added - Collected = Ending, so the four cards are one
          equation. Ending is the balance at the END of the selected period —
          for a past month that is not the same as what is owed today. */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Beginning Balance</div>
          <div className={styles.summaryValue}>{fmt(totals.beginning)}</div>
        </div>
        <div className={styles.summaryOp}>+</div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>AR Added</div>
          <div className={`${styles.summaryValue} ${styles.valueOrange}`}>{fmt(totals.added)}</div>
        </div>
        <div className={styles.summaryOp}>&minus;</div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Collected</div>
          <div className={`${styles.summaryValue} ${styles.valueGreen}`}>{fmt(totals.collected)}</div>
        </div>
        <div className={styles.summaryOp}>=</div>
        <div className={`${styles.summaryCard} ${styles.summaryCardTotal}`}>
          <div className={styles.summaryLabel}>Ending Balance</div>
          <div className={`${styles.summaryValue} ${styles.valueRed}`}>{fmt(totals.ending)}</div>
          {/* The date is on the card, not just next to the period picker: read
              without it, a past month's ending balance is indistinguishable
              from what is owed today, and the owner chases balances off this. */}
          <div className={styles.summarySub}>as of {end}</div>
        </div>
      </div>

      {/* Any non-zero drift means the equation above does not actually add up
          for some customer. Rather than let the owner reconcile four numbers
          that silently disagree, name it — same role as the Income Statement's
          cash reconciliation guard. */}
      {driftRows.length > 0 && (
        <div className={styles.driftWarning}>
          <strong>{fmt(Math.abs(totalDrift))} does not reconcile</strong> across{" "}
          {driftRows.length} customer{driftRows.length !== 1 ? "s" : ""}
          {" "}({driftRows.map((r) => r.name).join(", ")}). Beginning + Added &minus; Collected
          should equal Ending. Likely causes: an invoice collected for more than it was worth,
          or a collection dated before its own invoice.
        </div>
      )}

      {rows.length === 0 ? (
        <div className={styles.empty}>No A/R activity in {monthLabel(month)}.</div>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <span>Customer</span>
            <span className={styles.alignRight}>Beginning</span>
            <span className={styles.alignRight}>AR Added</span>
            <span className={styles.alignRight}>Collected</span>
            <span className={styles.alignRight}>Ending</span>
          </div>

          {rows.map((r) => (
            <div key={r.key} className={styles.row}>
              <span className={styles.customerCell}>{r.name}</span>
              {/* All four columns render a zero the same way ("—"), so a row
                  reads consistently rather than mixing 0.00 and dashes. */}
              <span className={`${styles.numCell} ${r.beginning > 0 ? "" : styles.valueDim}`}>
                {r.beginning > 0 ? fmt(r.beginning) : "—"}
              </span>
              <span className={`${styles.numCell} ${r.added > 0 ? styles.valueOrange : styles.valueDim}`}>
                {r.added > 0 ? fmt(r.added) : "—"}
              </span>
              <span className={`${styles.numCell} ${r.collected > 0 ? styles.valueGreen : styles.valueDim}`}>
                {r.collected > 0 ? fmt(r.collected) : "—"}
              </span>
              <span className={`${styles.numCell} ${r.ending > 0 ? styles.valueRed : styles.valueDim}`}>
                {r.ending > 0 ? fmt(r.ending) : "—"}
              </span>
            </div>
          ))}

          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Total ({rows.length} customer{rows.length !== 1 ? "s" : ""})</span>
            <span className={styles.numCell}>{fmt(totals.beginning)}</span>
            <span className={`${styles.numCell} ${styles.valueOrange}`}>{fmt(totals.added)}</span>
            <span className={`${styles.numCell} ${styles.valueGreen}`}>{fmt(totals.collected)}</span>
            <span className={`${styles.numCell} ${styles.valueRed}`}>{fmt(totals.ending)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
