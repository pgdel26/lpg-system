import { useState } from "react";
import { XIcon } from "./Icons";
import styles from "./AddCustomerModal.module.css";

export default function AddCustomerModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (name: string, phone: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    if (!name.trim()) { setError("Customer name is required."); return; }
    onSubmit(name.trim(), phone.trim());
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

        <div className={styles.fieldLast}>
          <label className={styles.label}>Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Phone number"
            className={`${styles.input} ${styles.inputMono}`}
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
