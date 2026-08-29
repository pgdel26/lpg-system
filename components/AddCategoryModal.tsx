import { useState } from "react";
import { XIcon } from "./Icons";
import styles from "./AddCategoryModal.module.css";

/**
 * Sibling of AddCustomerModal, deliberately down to one field: a category is
 * just a label, and anything else this dialog asked for would be a field the
 * Customers tab then has to display.
 */
export default function AddCategoryModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (name: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) { setError("Category name is required."); return; }
    const ok = await onSubmit(name.trim());
    // Rejected (a duplicate name) — the hook already toasts why; keep the modal
    // open so the operator can see and correct it.
    if (!ok) return;
    onClose();
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Add Category</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        <div className={styles.fieldLast}>
          <label className={styles.label}>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="e.g. Dealer, Walk-in, Institutional"
            className={styles.input}
            autoFocus
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} className={styles.saveButton}>Save</button>
        </div>
      </div>
    </div>
  );
}
