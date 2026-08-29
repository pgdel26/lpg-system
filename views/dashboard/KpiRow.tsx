import { fmt } from "../../lib/utils";
import Link from "next/link";
import type { DashboardSummary, PendingArSummary } from "../../lib/reports/dashboard";
import styles from "./KpiRow.module.css";

/** Accounts shown on the Pending A/R card before it defers to the full ledger. */
const AR_ACCOUNTS_SHOWN = 2;
/** Individual expenses listed on the Expenses card. */
const EXPENSES_SHOWN = 3;

interface KpiRowProps {
  summary: DashboardSummary;
  pendingAr: PendingArSummary;
  /** Whether this account may open a destination. See DashboardHome.canOpen. */
  canOpen: (href: string) => boolean;
}

export default function KpiRow({ summary, pendingAr, canOpen }: KpiRowProps) {
  const { netSales, outletSplit, expensesTotal, expenses } = summary;
  const topAccounts = pendingAr.accounts.slice(0, AR_ACCOUNTS_SHOWN);
  const remainingAccounts = pendingAr.accounts.length - topAccounts.length;
  const topExpenses = expenses.slice(0, EXPENSES_SHOWN);
  const remainingExpenses = expenses.length - topExpenses.length;

  return (
    <div className={styles.row}>
      {/* ─── Net Sales, with the outlet split folded in ─── */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            {/* NOT "Net Sales": the Sales Report has a row by that name that
                subtracts the day's expenses AND adds the tax collected, because
                it answers what must be remitted. This is netBilled, which does
                neither — tax is netted out of it (see lib/reports/billed.ts),
                so it still equals lib/reports/incomeStatement.ts's Net Revenue
                to the centavo. That agreement is the reason for the name. */}
            <div className={styles.cardTitle}>Net Revenue Today</div>
            <div className={styles.cardSub}>All outlets · before expenses</div>
          </div>
        </div>

        {/* No day-over-day percentage here: for the current day it compares a
            part-finished day against a complete one, so it reads as a slump
            every morning and a surge every evening regardless of trade. */}
        <div className={styles.valueRow}>
          <span className={styles.bigValue}>{fmt(netSales)}</span>
        </div>

        {/* The split lives inside this card because it's the same number broken
            down, not a separate metric — the parts always sum to the headline. */}
        {outletSplit.length > 0 && (
          <div className={styles.splitList}>
            {outletSplit.map((row) => {
              const href = `/${row.branchId}`;
              const openable = canOpen(href);
              // The whole row is the target, not just the name — bigger hit area,
              // and the amount is the part you're usually reading when you decide
              // to drill in.
              //
              // A restricted outlet keeps its NUMBER and loses only the link: the
              // headline above already includes that outlet, so dropping the row
              // would break this card's "the parts sum to the total" promise.
              const body = (
                <>
                  <div className={styles.splitLabelRow}>
                    <span className={styles.splitName}>{row.name}</span>
                    <span className={styles.splitValue}>{fmt(row.netSales)}</span>
                    {openable && (
                      <span className={styles.splitArrow} aria-hidden="true">&rarr;</span>
                    )}
                  </div>
                  <div className={styles.splitTrack}>
                    {/* width is genuinely runtime-dynamic — inline per the house rule */}
                    <div className={styles.splitFill} style={{ width: `${row.share * 100}%` }} />
                  </div>
                </>
              );
              return openable ? (
                <Link
                  key={row.branchId}
                  href={href}
                  className={styles.splitItem}
                  aria-label={`Open ${row.name} sales`}
                >
                  {body}
                </Link>
              ) : (
                <div key={row.branchId} className={styles.splitItem}>{body}</div>
              );
            })}
          </div>
        )}

      </div>

      {/* ─── Pending A/R ─── */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.cardTitle}>Pending A/R</div>
            <div className={styles.cardSub}>Outstanding balances</div>
          </div>
        </div>

        <div className={styles.valueRow}>
          <span className={`${styles.bigValue} ${styles.valueRed}`}>{fmt(pendingAr.total)}</span>
          <span className={styles.invoiceChip}>
            {pendingAr.openCount} invoice{pendingAr.openCount === 1 ? "" : "s"}
          </span>
        </div>

        {topAccounts.length > 0 && (
          <div className={styles.miniList}>
            {topAccounts.map((account) => (
              <div key={account.name} className={styles.miniRow}>
                <span className={styles.miniDot} />
                <span className={styles.miniName}>{account.name}</span>
                <span className={styles.miniAmount}>{fmt(account.amount)}</span>
              </div>
            ))}
            {/* Naming the remainder keeps two rows from reading as "these are
                the only accounts owing" when there are thirty more. */}
            {remainingAccounts > 0 && (
              <div className={styles.miniMore}>
                + {remainingAccounts} more account{remainingAccounts === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}

        {canOpen("/receivables") && (
          <Link href="/receivables" className={styles.cardAction}>
            See all accounts receivable &rarr;
          </Link>
        )}
      </div>

      {/* ─── Expenses ─── */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.cardTitle}>Expenses Today</div>
            <div className={styles.cardSub}>Across all outlets</div>
          </div>
        </div>

        <div className={styles.valueRow}>
          <span className={`${styles.bigValue} ${styles.valueOrange}`}>{fmt(expensesTotal)}</span>
          {expenses.length > 0 && (
            <span className={styles.countChip}>
              {expenses.length} entr{expenses.length === 1 ? "y" : "ies"}
            </span>
          )}
        </div>

        {expenses.length === 0 ? (
          <div className={styles.emptyInline}>Nothing logged today.</div>
        ) : (
          <div className={styles.miniList}>
            {topExpenses.map((entry) => (
              <div key={entry.key} className={styles.miniRow}>
                <span className={styles.miniDot} />
                <span className={styles.miniName}>{entry.description}</span>
                <span className={styles.miniAmount}>{fmt(entry.amount)}</span>
              </div>
            ))}
            {/* Same reason as the A/R card: three rows under a total shouldn't
                read as the whole day's spending when there are more. */}
            {remainingExpenses > 0 && (
              <div className={styles.miniMore}>
                + {remainingExpenses} more entr{remainingExpenses === 1 ? "y" : "ies"}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
