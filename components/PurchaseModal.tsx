import { useState } from "react";
import { XIcon, PlusIcon } from "./Icons";
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
  onSubmit: (items: PurchaseItem[], totalCost: string) => void;
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
    { section: defaultSection, product: defaultProduct, qty: "1" },
  ]);
  // One figure for the whole delivery. The supplier bills a total and only
  // itemizes a month later (if ever), so a per-line price would be invented.
  const [totalCost, setTotalCost] = useState("");

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
      { section: defaultSection, product: defaultProduct, qty: "1" },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalItems = items.reduce((sum, i) => sum + (parseInt(String(i.qty)) || 0), 0);

  const handleSubmit = () => {
    onSubmit(items, totalCost);
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

                {/* Row 2: Qty only — cost is entered once for the whole delivery */}
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
                </div>
              </div>
            );
          })}

          <button onClick={addItem} className={styles.addItemButton}>
            <PlusIcon /> Add Item
          </button>
        </div>

        {/* Total Cost — typed, not computed. This is the amount payable for the
            whole day's delivery; per-product cost is unknown at this point. */}
        <div className={styles.totalCard}>
          <label className={styles.totalLabel} htmlFor="purchase-total">
            Total Cost for this delivery *
          </label>
          <input
            id="purchase-total"
            type="number"
            min="0"
            step="0.01"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            placeholder="0.00"
            className={styles.totalInput}
          />
        </div>
        <div className={styles.totalHint}>
          {totalItems} item{totalItems !== 1 ? "s" : ""} across {items.length} line{items.length !== 1 ? "s" : ""}.
          Quantities are recorded per product; the cost is recorded for the day as a whole.
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
