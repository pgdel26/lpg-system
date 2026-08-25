import { fmt, formatDateShort } from "../lib/utils";
import { arMethodLabel, type CollectionBatch } from "../lib/receivables";
import { EditIcon, TrashIcon } from "./Icons";
import type { Branch } from "../lib/types";
import styles from "./CollectionsList.module.css";

interface CollectionsListProps {
  batches: CollectionBatch[];
  branches: Branch[];
  onEdit: (batch: CollectionBatch) => void;
  onVoid: (batch: CollectionBatch) => void;
  /** Shown in place of the rows when there are none. Each surface phrases it
   *  for its own scope ("today", "this filter"). */
  emptyText: string;
  /** The outlet tab already sits inside one branch, so repeating it on every
   *  row is noise. Receivables is company-wide and needs it. */
  showBranch?: boolean;
  /** Suppressed on the outlet tab, where the date is the whole page context. */
  showDate?: boolean;
}

// Cash is the only method that reaches the drawer, so it is the only one the
// day's Expected Cash Remit counts. The chip is colour-coded on exactly that
// distinction — green means "this is in the remit" — rather than being three
// arbitrary brand colours.
const METHOD_CLASS: Record<string, string> = {
  cash: styles.chipCash,
  check: styles.chipCheck,
  gcash: styles.chipGcash,
};

export default function CollectionsList({
  batches, branches, onEdit, onVoid, emptyText, showBranch = false, showDate = true,
}: CollectionsListProps) {
  const branchName = (id: string): string => branches.find((b) => b.id === id)?.name || id || "—";

  if (batches.length === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  return (
    <>
      {batches.map((b) => (
        <div key={b.batchId} className={styles.row}>
          <div className={styles.main}>
            <div className={styles.topLine}>
              <span className={styles.customer}>{b.customerName}</span>
              {/* An unrecorded method is shown as unknown, never as the "cash"
                  arCollectionEvents defaults it to — a green in-remit chip on a
                  collection nobody classified is the same false confidence this
                  panel exists to remove. */}
              <span className={`${styles.chip} ${
                !b.methodRecorded ? styles.chipUnknown : (METHOD_CLASS[b.method] || styles.chipCash)
              }`}>
                {!b.methodRecorded ? "Method not recorded" : b.mixedMethod ? "Mixed" : arMethodLabel(b.method)}
              </span>
            </div>
            <div className={styles.subLine}>
              {showDate && <span>{b.date ? formatDateShort(b.date) : "—"}</span>}
              {showDate && <span className={styles.sep}>&middot;</span>}
              <span>
                {b.invoices.length === 1
                  ? `Inv ${b.invoices[0]}`
                  : `${b.invoices.length} invoices: ${b.invoices.join(", ")}`}
              </span>
              {b.checkNumber && (
                <>
                  <span className={styles.sep}>&middot;</span>
                  <span>Ck {b.checkNumber}</span>
                </>
              )}
              {showBranch && (
                <>
                  <span className={styles.sep}>&middot;</span>
                  <span>{branchName(b.branch)}</span>
                </>
              )}
            </div>
            {b.notes && <div className={styles.notes}>{b.notes}</div>}
          </div>
          <div className={styles.right}>
            <span className={styles.amount}>{fmt(b.amount)}</span>
            <button onClick={() => onEdit(b)} className={styles.iconButton} title="Edit collection">
              <EditIcon />
            </button>
            <button onClick={() => onVoid(b)} className={styles.iconButton} title="Void collection">
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
