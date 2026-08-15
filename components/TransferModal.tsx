import { useState } from "react";
import { XIcon, PlusIcon } from "./Icons";
import type { Branch } from "../lib/types";
import styles from "./PurchaseModal.module.css";

interface TransferSubgroup {
  label: string;
  products: string[];
}

interface TransferSection {
  key: string;
  label: string;
  products?: string[];
  subgroups?: TransferSubgroup[];
}

export interface TransferItem {
  section: string;
  product: string;
  qty: string | number;
}

export interface TransferSubmitInput {
  toBranch: string;
  items: TransferItem[];
}

interface TransferModalProps {
  fromBranch: Branch;
  /** Candidate destination outlets — every branch except fromBranch. */
  destinationBranches: Branch[];
  date: string;
  setDate: (v: string) => void;
  error: string;
  purchaseSections: TransferSection[];
  /** Current on-hand (END) per section+product at fromBranch, for max-qty validation. */
  availableStock: Record<string, Record<string, number>>;
  onClose: () => void;
  onSubmit: (input: TransferSubmitInput) => void;
}

export default function TransferModal({
  fromBranch,
  destinationBranches,
  date, setDate,
  error,
  purchaseSections,
  availableStock,
  onClose, onSubmit,
}: TransferModalProps) {
  const getProductsForSection = (sectionKey: string): string[] => {
    const sec = purchaseSections.find((s) => s.key === sectionKey);
    if (!sec) return [];
    return sec.subgroups ? sec.subgroups.flatMap((sg) => sg.products) : (sec.products || []);
  };

  const getAvailable = (sectionKey: string, product: string): number =>
    availableStock[sectionKey]?.[product] ?? 0;

  const defaultSection = purchaseSections[0]?.key || "";
  const defaultProduct = getProductsForSection(defaultSection)[0] || "";

  const [toBranch, setToBranch] = useState(destinationBranches[0]?.id || "");
  const [items, setItems] = useState<TransferItem[]>([
    { section: defaultSection, product: defaultProduct, qty: "1" },
  ]);

  const updateItem = (index: number, field: string, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "section") {
        const prods = getProductsForSection(String(value));
        next[index] = { ...next[index], product: prods[0] || "", qty: "1" };
      }
      if (field === "product") {
        next[index] = { ...next[index], qty: "1" };
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

  // Each row is capped at that product's current on-hand count at the source
  // outlet — a transfer can't move more stock than actually exists there.
  const isOverStock = (item: TransferItem): boolean =>
    (parseInt(String(item.qty)) || 0) > getAvailable(String(item.section), String(item.product));

  const hasOverStockItem = items.some(isOverStock);

  const handleSubmit = () => {
    if (hasOverStockItem) return;
    onSubmit({ toBranch, items });
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Transfer Stock</h3>
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

        {/* From / To */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>From</label>
          <div className={styles.dateInput} style={{ color: "var(--text-dim)" }}>
            {fromBranch.name}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>To *</label>
          <select
            value={toBranch}
            onChange={(e) => setToBranch(e.target.value)}
            className={styles.fieldSelect}
            style={{ width: "100%" }}
          >
            {destinationBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Items */}
        <div className={styles.fieldGroup}>
          <label className={styles.smallLabel}>Items</label>

          {items.map((item, idx) => {
            const products = getProductsForSection(String(item.section));
            const available = getAvailable(String(item.section), String(item.product));
            const overStock = isOverStock(item);

            return (
              <div key={idx} className={styles.itemCard}>
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
                      max={available}
                      value={String(item.qty)}
                      onChange={(e) => updateItem(idx, "qty", e.target.value)}
                      className={styles.qtyInput}
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "qty", Math.min(available, (parseInt(String(item.qty)) || 1) + 1))}
                      className={styles.stepButton}
                    >+</button>
                  </div>
                  {/* Available-stock color is runtime-dynamic */}
                  <span
                    className={styles.dimLabel}
                    style={{ color: overStock ? "#f87171" : "var(--text-dim)" }}
                  >
                    Available: {available}
                  </span>
                </div>
                {overStock && (
                  <div className={styles.error} style={{ marginTop: 8, marginBottom: 0 }}>
                    Only {available} in stock at {fromBranch.name} — reduce the quantity.
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={addItem} className={styles.addItemButton}>
            <PlusIcon /> Add Item
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={hasOverStockItem}
            className={styles.submitButton}
            style={hasOverStockItem ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            Transfer Stock
          </button>
        </div>
      </div>
    </div>
  );
}
