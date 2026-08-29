import { XIcon } from "./Icons";
import { fmt, formatDateShort } from "../lib/utils";
import type { DiscountChange } from "../lib/types";
import styles from "./DiscountHistoryModal.module.css";

interface DiscountHistoryModalProps {
  customerName: string;
  product: string;
  /** The log as stored, oldest first. */
  history: DiscountChange[];
  onClose: () => void;
}

/**
 * What this customer's discount on this product has been, and since when.
 *
 * Read-only, and deliberately so: correcting a past rate would mean rewriting
 * the record of what was agreed. A wrong entry is fixed by setting the right
 * rate now, which appends rather than edits.
 */
export default function DiscountHistoryModal({
  customerName,
  product,
  history,
  onClose,
}: DiscountHistoryModalProps) {
  // Newest first for reading, but each entry's END is the NEXT one's start in
  // chronological order — so the ranges are worked out before reversing.
  const seconds = (e: DiscountChange): number => e.changedAt?.seconds || 0;
  const rows = [...history]
    // `from` first, then changedAt — which is what that field is FOR. Two rates
    // set on the same day share a `from`, and without the tiebreaker their order
    // would depend on insertion luck rather than on which came second.
    .sort((a, b) => (a.from || "").localeCompare(b.from || "") || seconds(a) - seconds(b))
    .map((entry, i, all) => ({
      ...entry,
      until: all[i + 1]?.from || null,
    }))
    .reverse();

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Discount history</h3>
          <button onClick={onClose} className={styles.closeButton}><XIcon /></button>
        </div>

        <div className={styles.subject}>
          <div className={styles.subjectProduct}>{product}</div>
          <div className={styles.subjectCustomer}>{customerName}</div>
        </div>

        {rows.length === 0 ? (
          /* Distinguishes "never had one" from "had one, unrecorded": agreements
             set before this log existed carry a rate but no entries. */
          <div className={styles.empty}>
            No discount changes recorded for this product yet. A rate set before the history
            existed will not appear here — set it again to start the log.
          </div>
        ) : (
          <div className={styles.list}>
            {rows.map((row, i) => (
              <div key={`${row.from}-${i}`} className={styles.row}>
                <span className={styles.rate}>{fmt(row.discountPerUnit)}<span className={styles.per}>/unit</span></span>
                <span className={styles.range}>
                  {formatDateShort(row.from)}
                  {row.until ? ` – ${formatDateShort(row.until)}` : ""}
                </span>
                {/* The top row is what the app is using right now. */}
                {!row.until && <span className={styles.currentBadge}>current</span>}
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Close</button>
        </div>
      </div>
    </div>
  );
}
