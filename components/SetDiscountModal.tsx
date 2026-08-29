import { useState } from "react";
import { XIcon } from "./Icons";
import { fmt, today } from "../lib/utils";
import styles from "./SetDiscountModal.module.css";

interface SetDiscountModalProps {
  customerName: string;
  product: string;
  /** The rate in force, for the "currently" line. */
  currentDiscount: number;
  onSubmit: (discountPerUnit: number) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Sets a new discount rate, and is the ONLY way to change one.
 *
 * The grid's Discount cell is read-only for that reason: every change goes
 * through here, so the history behind the other button has no holes in it. A
 * cell that also wrote the rate would leave a log that is wrong exactly when
 * someone needs it.
 */
export default function SetDiscountModal({
  customerName,
  product,
  currentDiscount,
  onSubmit,
  onClose,
}: SetDiscountModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (busy) return; // a fast double-Enter would otherwise fire two writes
    setError("");
    const rate = parseFloat(value);
    if (value.trim() === "" || Number.isNaN(rate)) {
      setError("Enter the new discount, in pesos per unit.");
      return;
    }
    if (rate < 0) {
      setError("A discount cannot be negative.");
      return;
    }
    setBusy(true);
    const ok = await onSubmit(rate);
    setBusy(false);
    if (ok) onClose();
    // Not ok means it was refused (same rate) or failed — the hook toasted
    // which, and the dialog stays open on the number just typed.
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Set new discount</h3>
          <button onClick={onClose} className={styles.closeButton}><XIcon /></button>
        </div>

        <div className={styles.subject}>
          <div className={styles.subjectProduct}>{product}</div>
          <div className={styles.subjectCustomer}>{customerName}</div>
        </div>

        <div className={styles.currentRow}>
          <span>Currently</span>
          <strong>{currentDiscount > 0 ? `${fmt(currentDiscount)}/unit` : "no discount set"}</strong>
        </div>

        <div className={styles.fieldLast}>
          <label className={styles.label}>New discount (₱ per unit) *</label>
          <div className={styles.moneyField}>
            <span className={styles.pesoSign}>₱</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="0.00"
              className={styles.input}
              autoFocus
            />
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {/* Says what saving does. The rate takes effect today and the old one
            becomes history — neither is reversible from this dialog. */}
        <p className={styles.note}>
          Takes effect today ({today()}), and is added to this product&rsquo;s discount history.
          Rates set before the history existed do not appear there.
        </p>

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton} disabled={busy}>Cancel</button>
          <button onClick={handleSubmit} className={styles.saveButton} disabled={busy}>
            {busy ? "Saving…" : "Save discount"}
          </button>
        </div>
      </div>
    </div>
  );
}
