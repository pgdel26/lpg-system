import { useState } from "react";
import { XIcon, PlusIcon } from "./Icons";
import { fmt } from "../lib/utils";
import styles from "./PurchaseModal.module.css";
import type { RecordPurchaseInput } from "../lib/hooks/usePurchasesData";

type PurchaseItem = RecordPurchaseInput["items"][number];

interface PurchaseSubgroup {
  label: string;
  products: string[];
}

interface PurchaseSection {
  key: string;
  label: string;
  products?: string[];
  subgroups?: PurchaseSubgroup[];
}

interface PurchaseModalProps {
  date: string;
  setDate: (v: string) => void;
  error: string;
  purchaseSections: PurchaseSection[];
  onClose: () => void;
  onSubmit: (items: PurchaseItem[]) => void;
}

export default function PurchaseModal({
  date, setDate,
  error,
  purchaseSections,
  onClose, onSubmit,
}: PurchaseModalProps) {
  const getProductsForSection = (sectionKey: string): string[] => {
    const sec = purchaseSections.find((s) => s.key === sectionKey);
    if (!sec) return [];
    return sec.subgroups ? sec.subgroups.flatMap((sg) => sg.products) : (sec.products || []);
  };

  const defaultSection = purchaseSections[0].key;
  const defaultProduct = getProductsForSection(defaultSection)[0] || "";

  const [items, setItems] = useState<PurchaseItem[]>([
    { section: defaultSection, product: defaultProduct, qty: "1", price: "" },
  ]);

  const updateItem = (index: number, field: string, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "section") {
        const prods = getProductsForSection(String(value));
        next[index] = { ...next[index], product: prods[0] || "" };
      }
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { section: defaultSection, product: defaultProduct, qty: "1", price: "" },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const getLineTotal = (item: PurchaseItem): number => {
    const qty = parseInt(String(item.qty)) || 0;
    const price = parseFloat(String(item.price)) || 0;
    return qty * price;
  };

  const grandTotal = items.reduce((sum, item) => sum + getLineTotal(item), 0);

  const handleSubmit = () => {
    onSubmit(items);
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Record Purchase</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        {/* Date */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Date *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={styles.dateInput}
          />
        </div>

        {/* Items */}
        <div className={styles.fieldGroup}>
          <label className={styles.smallLabel}>Items</label>

          {items.map((item, idx) => {
            const products = getProductsForSection(String(item.section));
            const lineTotal = getLineTotal(item);

            return (
              <div key={idx} className={styles.itemCard}>
                {/* Row 1: Category + Product + Remove */}
                <div className={styles.itemRow1}>
                  <select
                    value={String(item.section)}
                    onChange={(e) => updateItem(idx, "section", e.target.value)}
                    className={styles.fieldSelect}
                  >
                    {purchaseSections.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <select
                    value={String(item.product)}
                    onChange={(e) => updateItem(idx, "product", e.target.value)}
                    className={styles.fieldSelect}
                  >
                    {products.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className={styles.removeButton}>
                      <XIcon />
                    </button>
                  )}
                </div>

                {/* Row 2: Qty + Price + Line total */}
                <div className={styles.itemRow2}>
                  <div className={styles.qtyGroup}>
                    <span className={styles.dimLabel}>Qty</span>
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "qty", Math.max(1, (parseInt(String(item.qty)) || 1) - 1))}
                      className={styles.stepButton}
                    >−</button>
                    <input
                      type="number"
                      min="1"
                      value={String(item.qty)}
                      onChange={(e) => updateItem(idx, "qty", e.target.value)}
                      className={styles.qtyInput}
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "qty", (parseInt(String(item.qty)) || 1) + 1)}
                      className={styles.stepButton}
                    >+</button>
                  </div>
                  <span className={styles.multiplySign}>×</span>
                  <div className={styles.priceGroup}>
                    <span className={styles.dimLabel}>₱</span>
                    <input
                      type="number"
                      value={String(item.price)}
                      onChange={(e) => updateItem(idx, "price", e.target.value)}
                      placeholder="0"
                      className={styles.priceInput}
                    />
                  </div>
                  {/* lineTotal color is runtime-dynamic */}
                  <span
                    className={styles.lineTotal}
                    style={{ color: lineTotal > 0 ? "var(--accent-gold)" : "var(--text-dim)" }}
                  >
                    {lineTotal > 0 ? fmt(lineTotal) : "—"}
                  </span>
                </div>
              </div>
            );
          })}

          <button onClick={addItem} className={styles.addItemButton}>
            <PlusIcon /> Add Item
          </button>
        </div>

        {/* Total Cost */}
        <div className={styles.totalCard}>
          <span className={styles.totalLabel}>Total Cost</span>
          {/* grandTotal color is runtime-dynamic */}
          <span
            className={styles.totalValue}
            style={{ color: grandTotal > 0 ? "var(--accent-blue)" : "var(--text-dim)" }}
          >
            {fmt(grandTotal)}
          </span>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} className={styles.submitButton}>Record Purchase</button>
        </div>
      </div>
    </div>
  );
}
