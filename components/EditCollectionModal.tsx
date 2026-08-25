import { useState } from "react";
import { fmt, formatDateShort } from "../lib/utils";
import { arMethodLabel, type CollectionBatch } from "../lib/receivables";
import { XIcon } from "./Icons";
import type { Branch } from "../lib/types";
import type { EditArCollectionInput } from "../lib/hooks/useReceivablesData";
import styles from "./EditCollectionModal.module.css";

interface EditCollectionModalProps {
  /** One already-recorded collection, flattened across every invoice its batch
   *  touched — produced by collectionBatches() in lib/receivables.ts. */
  collection: CollectionBatch;
  branches: Branch[];
  onSubmit: (batchId: string, input: EditArCollectionInput) => Promise<string | null>;
  onClose: () => void;
}

// Same values, same colors, same order as RecordCollectionModal — an operator
// correcting a mistake should not have to re-learn the control they got wrong.
const METHODS: Array<{ value: "cash" | "check" | "gcash"; color: string }> = [
  { value: "cash", color: "#22c55e" },
  { value: "check", color: "#3b82f6" },
  { value: "gcash", color: "#0ea5e9" },
];

export default function EditCollectionModal({
  collection, branches, onSubmit, onClose,
}: EditCollectionModalProps) {
  const [amount, setAmount] = useState(String(collection.amount));
  const [method, setMethod] = useState(collection.method);
  const [branch, setBranch] = useState(collection.branch);
  const [checkDate, setCheckDate] = useState(collection.checkDate || "");
  const [checkNumber, setCheckNumber] = useState(collection.checkNumber || "");
  const [notes, setNotes] = useState(collection.notes || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Guarded: formatDateShort("") builds `new Date("T00:00:00")` and renders the
  // literal string "Invalid Date". Reachable, not theoretical — 72 legacy
  // collections carry no date, CollectionsList lists them, and Edit is one
  // click away.
  const dateLabel = collection.date ? formatDateShort(collection.date) : "no recorded date";
  const branchLabel = (id: string): string => branches.find((b) => b.id === id)?.name || id || "—";

  const amountNum = parseFloat(amount) || 0;
  // Centavo comparison, not a float ===: the stored amount comes back through
  // an <input> as a string, and 16776 vs 16776.000000001 must not read as a
  // change that triggers a full re-allocation.
  const amountChanged = Math.round(amountNum * 100) !== Math.round(collection.amount * 100);
  const methodChanged = method !== collection.method;
  const branchChanged = branch !== collection.branch;
  const detailsChanged = checkDate !== (collection.checkDate || "")
    || checkNumber !== (collection.checkNumber || "")
    || notes !== (collection.notes || "");
  // Nothing changed means nothing to write. Without this, an operator who opens
  // the modal and clicks Save stamps editedAt across the batch for no reason.
  const anyChange = amountChanged || methodChanged || branchChanged || detailsChanged;
  const canSubmit = amountNum > 0 && !!branch && anyChange && !submitting;

  // An amount change re-runs FIFO, which needs a date to place the replacement
  // events; the hook refuses outright when there isn't one. Say so up front
  // rather than letting them type a figure and hit a rejection on Save.
  const amountLocked = !collection.date;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    const err = await onSubmit(collection.batchId, {
      amount: amountNum,
      method,
      branch,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(method === "check" && checkDate ? { checkDate } : {}),
      ...(method === "check" && checkNumber ? { checkNumber } : {}),
    });
    setSubmitting(false);
    if (err) { setError(err); return; }
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Edit Collection</h3>
          <button onClick={onClose} className={styles.closeButton}><XIcon /></button>
        </div>

        {/* The two things that identify WHICH payment this is. Neither is
            editable: re-dating a collection moves cash between two days'
            Expected Cash Remit, and re-pointing it at another customer
            re-allocates it across different invoices. Both go through Void. */}
        <div className={styles.identityCard}>
          <div className={styles.identityRow}>
            <span className={styles.identityLabel}>Customer</span>
            <span className={styles.identityValue}>{collection.customerName}</span>
          </div>
          <div className={styles.identityRow}>
            <span className={styles.identityLabel}>Collection date</span>
            <span className={styles.identityValue}>{dateLabel}</span>
          </div>
          <div className={styles.identityNote}>
            To change either, void this collection and record it again.
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Amount</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={amountLocked}
            className={`${styles.input} ${styles.inputMono}`}
          />
          {amountLocked ? (
            <div className={styles.warningText}>
              This collection has no recorded date, so its amount can&apos;t be changed here.
              Void it and record it again.
            </div>
          ) : amountChanged && (
            <div className={styles.warningText}>
              Changing the amount re-applies it across this customer&apos;s invoices oldest-first.
              {collection.invoices.length > 1 ? ` This collection currently covers ${collection.invoices.length} invoices.` : ""}
            </div>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Method</span>
          <div className={styles.methodOptions}>
            {METHODS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMethod(opt.value)}
                className={styles.methodButton}
                style={{
                  border: method === opt.value ? `2px solid ${opt.color}` : "2px solid var(--border-light)",
                  background: method === opt.value ? `${opt.color}11` : "transparent",
                  color: method === opt.value ? opt.color : "var(--text-muted)",
                }}
              >
                {arMethodLabel(opt.value)}
              </button>
            ))}
          </div>
          {/* Only a cash collection reaches the drawer, so only a cash
              collection changes that day's Expected Cash Remit. Saying so here
              is the whole reason this modal exists. */}
          <div className={styles.methodHint}>
            {method === "cash"
              ? `Counts toward ${dateLabel}'s Expected Cash Remit.`
              : `Settles the receivable but does not touch the drawer — excluded from ${dateLabel}'s Expected Cash Remit.`}
          </div>
          {/* The delta, not just the end state. The headline case is correcting
              cash → check on a day already counted and remitted against, and
              the operator needs to know that day's expected figure is about to
              move. Same wording the void confirmations use. */}
          {methodChanged && collection.method === "cash" && method !== "cash" && (
            <div className={styles.warningText}>
              Reduces {dateLabel}&apos;s Expected Cash Remit for {branchLabel(collection.branch)} by {fmt(collection.amount)}.
            </div>
          )}
          {methodChanged && collection.method !== "cash" && method === "cash" && (
            <div className={styles.warningText}>
              Adds {fmt(amountNum)} to {dateLabel}&apos;s Expected Cash Remit for {branchLabel(branch)}.
            </div>
          )}
        </div>

        {method === "check" && (
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <span className={styles.label}>Check no. <span className={styles.optional}>optional</span></span>
              <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)}
                className={`${styles.input} ${styles.inputMono}`} />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Check date <span className={styles.optional}>optional</span></span>
              <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
                className={styles.input} />
            </div>
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.label}>Received at</span>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={styles.input}>
            <option value="">Select outlet…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {/* Branch has the same consequence as method, on a second axis: the
              remit is computed per outlet, so moving a CASH collection debits
              one outlet's expected figure and credits another's — two operators'
              reconciliations, both for a day already closed. */}
          {branchChanged && method === "cash" && (
            <div className={styles.warningText}>
              Moves {fmt(amountNum)} out of {branchLabel(collection.branch)}&apos;s {dateLabel} Expected
              Cash Remit and into {branchLabel(branch)}&apos;s.
            </div>
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Notes <span className={styles.optional}>optional</span></span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={styles.input} />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit} className={styles.submitButton}>
            {submitting ? "Saving…" : `Save ${fmt(amountNum)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
