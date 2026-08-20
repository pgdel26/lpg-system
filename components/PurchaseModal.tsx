import { useState } from "react";
import { XIcon } from "./Icons";
import styles from "./PurchaseModal.module.css";
import { purchaseLineKey } from "../lib/purchases";
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
  /** Editing an existing delivery rather than recording a new one. Create and
   *  edit share this component deliberately: same fields, same rules. Only the
   *  wording, the starting values, and what onSubmit does differ. */
  editing?: boolean;
  /** Starting quantities, keyed by purchaseLineKey(). A product absent from the map
   *  starts blank, which still means "not part of this delivery". */
  initialQuantities?: Record<string, string>;
  initialTotalCost?: string;
}


export default function PurchaseModal({
  date, setDate,
  error,
  purchaseSections,
  onClose, onSubmit,
  editing = false,
  initialQuantities,
  initialTotalCost,
}: PurchaseModalProps) {
  // Every product in every section gets a field; only the ones the operator
  // fills in become purchase lines. Sparse map rather than one entry per
  // product so "untouched" and "explicitly zero" stay distinguishable.
  //
  // Initialisers, not an effect: the caller mounts this component fresh per
  // delivery, so there is no later moment for the props to arrive — and an
  // effect syncing them would fight the operator's own typing.
  const [quantities, setQuantities] = useState<Record<string, string>>(initialQuantities || {});
  const [totalCost, setTotalCost] = useState(initialTotalCost || "");

  const setQty = (sectionKey: string, product: string, value: string) => {
    setQuantities((prev) => ({ ...prev, [purchaseLineKey(sectionKey, product)]: value }));
  };

  const rowsFor = (section: PurchaseSection): Array<{ label?: string; products: string[] }> =>
    section.subgroups
      ? section.subgroups.map((sg) => ({ label: sg.label, products: sg.products }))
      : [{ products: section.products || [] }];

  const items: PurchaseItem[] = purchaseSections.flatMap((section) =>
    rowsFor(section).flatMap((group) =>
      group.products
        .map((product) => ({
          section: section.key,
          product,
          qty: parseInt(quantities[purchaseLineKey(section.key, product)] || "") || 0,
        }))
        .filter((i) => i.qty > 0),
    ),
  );

  const totalItems = items.reduce((sum, i) => sum + Number(i.qty), 0);

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
          <h3 className={styles.title}>{editing ? "Edit Delivery" : "Record Purchase"}</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Date *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={styles.dateInput}
          />
        </div>

        {/* Total Cost — typed, not computed. This is the amount payable for this
            delivery; the supplier does not itemize it at purchase time. */}
        <div className={styles.totalCard}>
          <label className={styles.totalLabel} htmlFor="purchase-total">
            {editing
              ? "Total Cost for this delivery"
              : "Total Cost for this delivery *"}
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

        {/* Quantities. Every product is listed; blanks are simply not recorded,
            so there is no add/remove-line step. */}
        <div className={styles.quantityList}>
          {purchaseSections.map((section) => (
            <div key={section.key} className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>{section.label}</div>
              {rowsFor(section).map((group, gi) => (
                <div key={group.label || gi}>
                  {group.label && <div className={styles.subgroupHeader}>{group.label}</div>}
                  {group.products.map((product) => {
                    const key = purchaseLineKey(section.key, product);
                    const value = quantities[key] || "";
                    return (
                      <div key={key} className={styles.productRow}>
                        <span className={styles.productName}>{product}</span>
                        <input
                          type="number"
                          min="0"
                          value={value}
                          onChange={(e) => setQty(section.key, product, e.target.value)}
                          placeholder="0"
                          /* Filled rows are tinted so the handful that were
                             actually delivered stand out in a long list. */
                          className={`${styles.qtyInput} ${value.trim() !== "" && value !== "0" ? styles.qtyInputFilled : ""}`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.totalHint}>
          {totalItems} item{totalItems !== 1 ? "s" : ""} across {items.length} product{items.length !== 1 ? "s" : ""}.
          Quantities are recorded per product; the cost is recorded for the delivery as a whole.
          {editing && " Clearing a quantity removes that product from this delivery; the delivery and its cost remain. Leave the cost blank to keep it unchanged."}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} className={styles.submitButton}>
            {editing ? "Save Delivery" : "Record Purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}
