import { useState, useMemo } from "react";
import { fmt, today } from "../../lib/utils";
import { arRollForward } from "../../lib/receivables";
import type { SaleTransaction } from "../../lib/types";
import styles from "./ArSummaryTab.module.css";

interface ArSummaryTabProps {
  arTransactions: SaleTransaction[];
}

/** First and last day of a YYYY-MM month, as YYYY-MM-DD strings. Kept in string
 *  space so nothing downstream can pick up a local-timezone offset; lib/utils
 *  solves the same problem with Date.UTC + getUTCDate, which is equally safe. */
function monthBounds(yyyymm: string): { start: string; end: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return { start: `${yyyymm}-01`, end: `${yyyymm}-${String(days).padStart(2, "0")}` };
}

/** Selectable months, newest first.
 *
 *  Spans the earliest invoice month through the LATER of the current month and
 *  the latest invoice month. Both bounds matter: sale dates are operator-typed
 *  (useSalesData's `date: saleDate || inventoryDate`), so a single mis-typed
 *  year can put an invoice outside the range — and a month that isn't
 *  selectable is money that appears in the Transactions tab's Total Pending but
 *  in no period here. The lower bound is clamped to 36 months so one 1970 typo
 *  can't generate a 600-option picker; the range is then bounded by
 *  construction rather than by a loop guard that fails silently. */
const MAX_MONTHS = 36;
function addMonths(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  // ((n % 12) + 12) % 12 rather than n % 12: JS's remainder keeps the sign, so a
  // negative total would otherwise yield a month of 0 or less. Unreachable with
  // real dates, but the guard costs nothing and the failure would be silent.
  const month = ((total % 12) + 12) % 12;
  return `${Math.floor(total / 12)}-${String(month + 1).padStart(2, "0")}`;
}
function monthOptions(docs: SaleTransaction[]): string[] {
  const current = today().slice(0, 7);
  const dates = docs.map((t) => t.date).filter(Boolean).sort();
  const last = dates.length ? (dates[dates.length - 1] as string).slice(0, 7) : current;
  const newest = last > current ? last : current;
  const first = dates.length ? (dates[0] as string).slice(0, 7) : current;
  const floor = addMonths(newest, -(MAX_MONTHS - 1));
  const earliest = first > floor ? first : floor;
  const out: string[] = [];
  for (let key = earliest; key <= newest; key = addMonths(key, 1)) out.push(key);
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
