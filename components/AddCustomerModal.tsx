import { useState } from "react";
import { XIcon } from "./Icons";
import type { CustomerCategory } from "../lib/types";
import styles from "./AddCustomerModal.module.css";

export default function AddCustomerModal({
  categories,
  onSubmit,
  onClose,
}: {
  /** Categories to file the new customer under; empty until any are set up. */
  categories: CustomerCategory[];
  onSubmit: (name: string, phone: string, categoryId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) { setError("Customer name is required."); return; }
    const ok = await onSubmit(name.trim(), phone.trim(), categoryId);
    // Rejected (e.g. name/phone conflict) — the hook already toasts why;
    // keep the modal open so the operator can see and correct it.
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
          <h3 className={styles.title}>Add Customer</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Customer name"
            className={styles.input}
            autoFocus
          />
        </div>

        <div className={categories.length > 0 ? styles.field : styles.fieldLast}>
          <label className={styles.label}>Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Phone number"
            className={`${styles.input} ${styles.inputMono}`}
          />
        </div>

        {/* Only offered once categories exist — an empty picklist reading
            "Uncategorised" and nothing else is a field that can't be answered.
            Optional either way: filing can happen later from the list. */}
        {categories.length > 0 && (
          <div className={styles.fieldLast}>
            <label className={styles.label}>Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={styles.input}
            >
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} className={styles.saveButton}>Save</button>
        </div>
      </div>
    </div>
  );
}
