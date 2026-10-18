import type { ReactNode } from "react";
import { XIcon } from "./Icons";
import styles from "./SaleLineCard.module.css";
import type { RecordSaleInput } from "../lib/hooks/useSalesData";

type SaleItem = RecordSaleInput["items"][number];

interface SaleLineCardProps {
  item: SaleItem;
  salesSections: Array<{ key: string; label: string }>;
  products: string[];
  onChange: (field: "section" | "product" | "qty", value: string | number) => void;
  /** Omit to hide the remove button (e.g. the last remaining product line). */
  onRemove?: () => void;
  /** Right-hand side of the qty row: price × line total, or "Free". */
  trailing: ReactNode;
}

// One line of the Record Sale modal — section, product, qty stepper. Shared by
// paid product lines and free incentive lines so the two can't drift apart.
export default function SaleLineCard({ item, salesSections, products, onChange, onRemove, trailing }: SaleLineCardProps) {
  const qty = parseInt(String(item.qty)) || 1;
  return (
    <div className={styles.itemCard}>
      <div className={styles.itemRow1}>
        <select
          value={String(item.section)}
          onChange={(e) => onChange("section", e.target.value)}
          className={styles.fieldSelect}
        >
          {salesSections.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select
          value={String(item.product)}
          onChange={(e) => onChange("product", e.target.value)}
          className={styles.fieldSelect}
        >
          {products.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {onRemove && (
          <button onClick={onRemove} className={styles.removeButton}>
            <XIcon />
          </button>
        )}
      </div>

      <div className={styles.itemRow2}>
        <div className={styles.qtyGroup}>
          <span className={styles.dimLabel}>Qty</span>
          <button
            type="button"
            onClick={() => onChange("qty", Math.max(1, qty - 1))}
            className={styles.stepButton}
          >−</button>
          <input
            type="number"
            min="1"
            value={String(item.qty)}
            onChange={(e) => onChange("qty", e.target.value)}
            className={styles.qtyInput}
          />
          <button
            type="button"
            onClick={() => onChange("qty", qty + 1)}
            className={styles.stepButton}
          >+</button>
        </div>
        {trailing}
      </div>
    </div>
  );
}
