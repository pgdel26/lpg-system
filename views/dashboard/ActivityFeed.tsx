import Link from "next/link";
import { fmt } from "../../lib/utils";
import type { FeedRow, FeedKind } from "../../lib/reports/dashboard";
import type { Branch } from "../../lib/types";
import styles from "./ActivityFeed.module.css";

const KIND_LABEL: Record<FeedKind, string> = {
  sale: "Sale",
  swap: "Swap",
  refund: "Return",
  collection: "Collection",
};

/** Local clock time of an epoch ms value, e.g. "10:42 AM". */
const timeLabel = (at: number): string =>
  new Date(at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

interface ActivityFeedProps {
  rows: FeedRow[];
  /** One "view transactions" button per outlet, in branch order. */
  branches: Branch[];
  /** Cap on rendered rows; the footnote reports the true total. */
  limit?: number;
  /** Hides an outlet's button when that outlet is restricted. */
  canOpen: (href: string) => boolean;
}

export default function ActivityFeed({ rows, branches, canOpen, limit = 12 }: ActivityFeedProps) {
  const visible = rows.slice(0, limit);
  const hiddenCount = rows.length - visible.length;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>Recent Transactions</span>
        {/* One button per outlet, generated from the branches collection rather
            than hardcoded — a third outlet has to be addable by adding a doc,
            not by editing this file. The feed itself is company-wide; these are
            the way through to a single outlet's own ledger. */}
        <div className={styles.headActions}>
          {branches.filter((branch) => canOpen(`/${branch.id}`)).map((branch) => (
            <Link
              key={branch.id}
              href={`/${branch.id}`}
              className={styles.branchButton}
            >
              View {branch.name}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>Nothing recorded on this day.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Ref</th>
                <th className={styles.th}>Time</th>
                <th className={styles.th}>Outlet</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Detail</th>
                <th className={`${styles.th} ${styles.right}`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} className={styles.tr}>
                  <td className={`${styles.td} ${styles.mono}`}>{row.ref}</td>
                  <td className={`${styles.td} ${styles.mono}`}>{timeLabel(row.at)}</td>
                  <td className={styles.td}>{row.branchName || "—"}</td>
                  <td className={styles.td}>
                    <span className={`${styles.kind} ${styles[row.kind]}`}>
                      {KIND_LABEL[row.kind]}
                    </span>
                  </td>
                  <td className={`${styles.td} ${styles.detail}`}>{row.description}</td>
                  {/* A return is money leaving; it reads negative and red so it
                      can't be scanned as income. */}
                  <td
                    className={`${styles.td} ${styles.right} ${styles.mono} ${
                      row.amount < 0 ? styles.negative : ""
                    }`}
                  >
                    {fmt(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className={styles.footnote}>
          {/* A truncated list that doesn't say so reads as the whole day. The
              outlet buttons above are where you go for the rest, so this states
              the fact without repeating them as a third link. */}
          {hiddenCount > 0 && <>Showing {visible.length} of {rows.length}. </>}
          Collections are payments against earlier invoices, not new sales, so this
          column doesn&apos;t sum to Net Sales.
        </div>
      )}
    </div>
  );
}
