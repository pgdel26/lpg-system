import { useState, useMemo } from "react";
import { fmt, today } from "../../lib/utils";
import { arRollForward } from "../../lib/receivables";
import type { SaleTransaction } from "../../lib/types";
import styles from "./ArSummaryTab.module.css";

interface ArSummaryTabProps {
  arTransactions: SaleTransaction[];
}

/** First and last day of the month containing `date`, as YYYY-MM-DD. Derived by
 *  string slicing plus a day-count table rather than Date math — the rest of the
 *  app treats these as opaque PHT date strings, and constructing a Date here
 *  would reintroduce the timezone-offset bug those strings exist to avoid. */
function monthBounds(yyyymm: string): { start: string; end: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return { start: `${yyyymm}-01`, end: `${yyyymm}-${String(days).padStart(2, "0")}` };
}

/** Every month from the earliest invoice through the current one, newest first. */
function monthOptions(docs: SaleTransaction[]): string[] {
  const current = today().slice(0, 7);
  const dates = docs.map((t) => t.date).filter(Boolean).sort();
  const earliest = (dates[0] || today()).slice(0, 7);
  const out: string[] = [];
  let [y, m] = earliest.split("-").map(Number);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= current) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out.reverse();
}

const MONTH_LABELS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const monthLabel = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
};

export default function ArSummaryTab({ arTransactions }: ArSummaryTabProps) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const months = useMemo(() => monthOptions(arTransactions), [arTransactions]);
  const { start, end } = monthBounds(month);

  const rows = useMemo(
    () => arRollForward(arTransactions, start, end),
    [arTransactions, start, end],
  );

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
        </div>
      </div>

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
              <span className={styles.numCell}>{fmt(r.beginning)}</span>
              <span className={`${styles.numCell} ${r.added > 0 ? styles.valueOrange : styles.valueDim}`}>
                {r.added > 0 ? fmt(r.added) : "—"}
              </span>
              <span className={`${styles.numCell} ${r.collected > 0 ? styles.valueGreen : styles.valueDim}`}>
                {r.collected > 0 ? fmt(r.collected) : "—"}
              </span>
              <span className={`${styles.numCell} ${r.ending > 0 ? styles.valueRed : styles.valueDim}`}>
                {fmt(r.ending)}
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
