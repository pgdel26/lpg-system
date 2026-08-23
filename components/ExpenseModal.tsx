import { useState } from "react";
import { XIcon } from "./Icons";
import { EXPENSE_CATEGORIES, categoryRequiresStaff, type ExpenseCategory } from "../lib/expenses";
import type { Staff } from "../lib/types";
import styles from "./ExpenseModal.module.css";

export interface ExpenseSubmission {
  description: string;
  amount: number;
  category: string;
  staffId?: string;
}

export default function ExpenseModal({
  staff,
  onSubmit,
  onClose,
}: {
  staff: Staff[];
  onSubmit: (input: ExpenseSubmission) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>("operating");
  const [staffId, setStaffId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const needsStaff = categoryRequiresStaff(category);

  const handleSubmit = () => {
    setError("");
    if (needsStaff && !staffId) { setError("Please select the staff member."); return; }
    // Description is optional for a salary: the staff member identifies it, and
    // expenseDisplayLabel derives "Salary — Name" at read time. Required for
    // anything else, where nothing else says what the money went on.
    if (!needsStaff && !description.trim()) { setError("Please enter a description."); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setError("Please enter a valid amount."); return; }
    onSubmit({
      description,
      amount: parsed,
      category,
      ...(needsStaff ? { staffId } : {}),
    });
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

        {/* First field: it decides what the rest of the form asks for. */}
        <div className={styles.field}>
          <label className={styles.label}>Category</label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ExpenseCategory);
              // Clear the staff pick when leaving Salary, so a stale id can't
              // ride along on an operating expense.
              if (!categoryRequiresStaff(e.target.value)) setStaffId("");
              setError("");
            }}
            className={styles.input}
            autoFocus
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {needsStaff && (
          <div className={styles.field}>
            <label className={styles.label}>Staff</label>
            <select
              value={staffId}
              onChange={(e) => { setStaffId(e.target.value); setError(""); }}
              className={styles.input}
            >
              <option value="">Select staff...</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.role ? ` (${s.role})` : ""}
                </option>
              ))}
            </select>
            {staff.length === 0 && (
              <div className={styles.hint}>
                No staff on file yet — add them on the Staff screen first.
              </div>
            )}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>
            Description
            {needsStaff && <span className={styles.optional}> (optional)</span>}
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={needsStaff ? "" : "e.g. Gas, Load, Supplies"}
            className={styles.input}
          />
        </div>

        <div className={styles.fieldLast}>
          <label className={styles.label}>Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={styles.input}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} className={styles.submitButton}>Add Expense</button>
        </div>
      </div>
    </div>
  );
}
