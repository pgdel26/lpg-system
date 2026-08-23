import { fmt, formatDateShort } from "../../lib/utils";
import styles from "./DeliveryDetailPanel.module.css";

/** One product line of a delivery. Read-only here — see the note below. */
interface DeliveryLine {
  key: string;
  product: string;
  quantity: number;
}

interface DeliverySummary {
  deliveryId: string;
  date: string;
  totalCost?: number;
  costPending?: boolean;
  lineCount: number;
  itemCount: number;
}

interface DeliveryDetailPanelProps {
  /** null when nothing is selected — the panel then explains what to do. */
  delivery: DeliverySummary | null;
  lines: DeliveryLine[];
}

/**
 * The selected day's product lines, beside the list rather than expanded inside
 * it. A month of deliveries expanded inline ran to hundreds of rows; here the
 * list stays one row per day and the detail has a fixed home.
 *
 * Deliberately READ-ONLY, with no controls at all. A delivery's products are
 * edited through its own Edit Delivery modal, reached from the pencil on that
 * day's row in the list. Anything actionable here would be a second route to the
 * same writes — which is also why the old inline child rows had no buttons.
 */
export default function DeliveryDetailPanel({
  delivery, lines,
}: DeliveryDetailPanelProps) {
  if (!delivery) {
    return (
      <aside className={styles.panel}>
        <div className={styles.placeholder}>
          Select a day on the left to see the products delivered.
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        {/* No Edit button here: every delivery row in the list already carries
            a pencil, and two routes to the same modal is one too many. */}
        <span className={styles.headerDate}>{formatDateShort(delivery.date)}</span>
        <div className={styles.headerMeta}>
          {delivery.itemCount} item{delivery.itemCount !== 1 ? "s" : ""} ·{" "}
          {delivery.lineCount} product{delivery.lineCount !== 1 ? "s" : ""}
        </div>
        {/* Three states, and collapsing any two would misreport money: a real
            total, a delivery nobody has costed yet (placeholder 0 must never
            render as ₱0.00), and a doc that simply isn't loaded. */}
        <div className={styles.headerCost}>
          {delivery.costPending ? (
            <span className={styles.costPending}>Not yet costed</span>
          ) : delivery.totalCost == null ? (
            <span className={styles.costUnknown}>Cost unavailable</span>
          ) : (
            fmt(delivery.totalCost)
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <div className={styles.placeholder}>No product lines on this delivery.</div>
      ) : (
        <div className={styles.lines}>
          {lines.map((line) => (
            <div key={line.key} className={styles.line}>
              <span className={styles.lineProduct}>{line.product}</span>
              <span className={styles.lineQty}>{line.quantity}</span>
            </div>
          ))}
          <div className={styles.lineTotal}>
            <span>Total items</span>
            <span className={styles.lineQty}>{delivery.itemCount}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
