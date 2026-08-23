import Link from "next/link";
import { PackageIcon } from "../../components/Icons";
import type { LowStockRow } from "../../lib/reports/dashboard";
import styles from "./LowStockCard.module.css";

/** Alerts listed before the card defers to the Inventory screen. Rows arrive
 *  already sorted most-urgent-first, so the slice takes the ones that matter. */
const ROWS_SHOWN = 4;

interface LowStockCardProps {
  rows: LowStockRow[];
  /** Outlets with no inventory recorded for the selected day. */
  missingOutlets: string[];
  inventoryHref: string;
  /** Suppresses the Open Inventory link when that outlet is restricted. */
  canOpen: (href: string) => boolean;
}

export default function LowStockCard({
  rows,
  missingOutlets,
  inventoryHref,
  canOpen,
}: LowStockCardProps) {
  const visibleRows = rows.slice(0, ROWS_SHOWN);
  const remainingRows = rows.length - visibleRows.length;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.headIcon}><PackageIcon /></span>
        <span className={styles.title}>Low Stock Action</span>
        {rows.length > 0 && (
          <span className={styles.countBadge}>
            {rows.length} ITEM{rows.length === 1 ? "" : "S"}
          </span>
        )}
      </div>

      <div className={styles.body}>
        {/* An uncounted outlet and a genuinely well-stocked one both produce zero
            alert rows, and telling them apart matters: one means "you're fine",
            the other means "nobody has entered today's counts yet". Reporting
            the first when it's actually the second is how a stockout gets
            missed. Shown ALONGSIDE any rows, not instead of them — one outlet
            can be counted while the other isn't. */}
        {missingOutlets.length > 0 && (
          <div className={styles.notice}>
            No inventory recorded for <strong>{missingOutlets.join(" & ")}</strong> on this day,
            so stock there can&apos;t be checked.{" "}
            {canOpen(inventoryHref) && (
              <Link href={inventoryHref} className={styles.noticeLink}>Open Inventory</Link>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          missingOutlets.length > 0 ? null : (
            <div className={styles.empty}>
              Every counted cylinder has more than 4 days of cover.
            </div>
          )
        ) : (
          <div className={styles.list}>
            {visibleRows.map((row) => (
              <div key={row.key} className={styles.item}>
                <div className={styles.itemTop}>
                  <span className={styles.product}>{row.product}</span>
                  <span className={`${styles.level} ${styles[row.level]}`}>
                    {/* Not `level === "out" ? "0 left"`: level is "out" for
                        onHand <= 0, so that collapsed an oversold -7 into a
                        calm-looking 0 and threw away the real signal. */}
                    {row.onHand === 0 ? "None left" : `${row.onHand} left`}
                  </span>
                </div>

                {/* Where the mockup had a SKU. Outlet and days-of-cover are the
                    two facts that make the row actionable; this app has no SKU
                    field, and a SKU wouldn't tell you which outlet is short. */}
                <div className={styles.itemMeta}>
                  <span className={styles.branch}>{row.branchName}</span>
                  {row.daysOfCover !== null && row.level !== "out" && (
                    <>
                      <span className={styles.metaDot}>·</span>
                      <span>{row.daysOfCover.toFixed(1)} days left</span>
                    </>
                  )}
                  {row.perDay > 0 && (
                    <>
                      <span className={styles.metaDot}>·</span>
                      <span>~{row.perDay.toFixed(1)}/day</span>
                    </>
                  )}
                </div>

              </div>
            ))}

            {/* Four rows under a badge reading "18 ITEMS" would otherwise look
                like the whole list; this says outright that it isn't. */}
            {remainingRows > 0 && (
              <Link href={inventoryHref} className={styles.more}>
                + {remainingRows} more item{remainingRows === 1 ? "" : "s"} &rarr;
              </Link>
            )}
          </div>
        )}
      </div>

      <div className={styles.footnote}>
        Days of cover = full cylinders on hand ÷ average sold per day over the last 30 days.
        Products with no sales in that window appear only when they hit zero.
      </div>
    </div>
  );
}
