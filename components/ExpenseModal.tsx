import { useState } from "react";
import { XIcon } from "./Icons";
import styles from "./ExpenseModal.module.css";

export default function ExpenseModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (description: string, amount: number) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    if (!description.trim()) { setError("Please enter a description."); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setError("Please enter a valid amount."); return; }
    onSubmit(description, parsed);
    onClose();
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Add Expense</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Gas, Load, Supplies"
            className={styles.input}
            autoFocus
          />
        </div>

        <div className={styles.fieldLast}>
          <label className={styles.label}>Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`${styles.input} ${styles.inputMono}`}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} className={styles.submitButton}>Add Expense</button>
        </div>
      </div>
    </div>
  );
}
