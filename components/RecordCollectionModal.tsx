import { useMemo, useState } from "react";
import { fmt, today, formatDateShort } from "../lib/utils";
import { customerKey } from "../lib/customers";
import { arStatus, allocateFifo, type FifoTarget } from "../lib/receivables";
import { XIcon } from "./Icons";
import type { SaleTransaction, Branch } from "../lib/types";
import type { RecordArCollectionInput } from "../lib/hooks/useReceivablesData";
import styles from "./RecordCollectionModal.module.css";

interface CustomerBalance {
  key: string;
  name: string;
  balance: number;
  invoiceCount: number;
}

interface RecordCollectionModalProps {
  arTransactions: SaleTransaction[];
  branches: Branch[];
  onSubmit: (input: RecordArCollectionInput) => Promise<string | null>;
  onClose: () => void;
}

const METHODS: Array<{ value: "cash" | "check" | "gcash"; label: string; color: string }> = [
  { value: "cash", label: "Cash", color: "#22c55e" },
  { value: "check", label: "Check", color: "#3b82f6" },
  { value: "gcash", label: "GCash", color: "#0ea5e9" },
];

export default function RecordCollectionModal({
  arTransactions, branches, onSubmit, onClose,
}: RecordCollectionModalProps) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "check" | "gcash">("cash");
  const [date, setDate] = useState(today());
  // No default — Receivables is a company-wide, not branch-scoped, page, so
  // pre-selecting an outlet (e.g. always the first one) would let a clerk
  // submit without noticing, misattributing cash between PILI/CADLAN.
  const [branch, setBranch] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // One entry per customer with a nonzero balance, sorted by balance desc —
  // same identity rule as TopDebtorsChart/useCustomersData so this agrees
  // with the rest of the app on "who is this customer."
  const customerBalances = useMemo<CustomerBalance[]>(() => {
    const byCustomer = new Map<string, CustomerBalance>();
    for (const t of arTransactions) {
      const status = arStatus(t);
      if (status.status === "collected") continue;
      const key = customerKey(t.customerName || "Unknown");
      const entry = byCustomer.get(key) || { key, name: t.customerName || "Unknown", balance: 0, invoiceCount: 0 };
      entry.balance = Math.round((entry.balance + status.remaining) * 100) / 100;
      entry.invoiceCount += 1;
      byCustomer.set(key, entry);
    }
    return Array.from(byCustomer.values()).sort((a, b) => b.balance - a.balance);
  }, [arTransactions]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customerBalances;
    return customerBalances.filter((c) => c.name.toLowerCase().includes(q));
  }, [customerBalances, search]);

  const selectedCustomer = customerBalances.find((c) => c.key === selectedKey) || null;

  const invoiceTargets = useMemo(() => {
    if (!selectedKey) return [];
    return arTransactions
      .filter((t) => customerKey(t.customerName || "Unknown") === selectedKey && arStatus(t).status !== "collected")
      .map((t) => ({ t, remaining: arStatus(t).remaining }));
  }, [arTransactions, selectedKey]);

  const amountNum = parseFloat(amount) || 0;

  const fifoPreview = useMemo(() => {
    if (!selectedCustomer || amountNum <= 0) return [];
    const targets: FifoTarget[] = invoiceTargets.map(({ t, remaining }) => ({
      id: t.id, date: t.date, createdAtSeconds: t.createdAt?.seconds || 0, remaining,
    }));
    const allocations = allocateFifo(targets, Math.min(amountNum, selectedCustomer.balance));
    const byId = new Map(allocations.map((a) => [a.id, a.amount]));
    return invoiceTargets
      .map(({ t, remaining }) => ({ t, before: remaining, applied: byId.get(t.id) || 0 }))
      .sort((a, b) => a.t.date.localeCompare(b.t.date) || (a.t.createdAt?.seconds || 0) - (b.t.createdAt?.seconds || 0));
  }, [invoiceTargets, selectedCustomer, amountNum]);

  const touchedRows = fifoPreview.filter((r) => r.applied > 0);
  const untouchedRows = fifoPreview.filter((r) => r.applied === 0);
  const settledCount = touchedRows.filter((r) => Math.round(r.applied * 100) >= Math.round(r.before * 100)).length;
  const partialCount = touchedRows.length - settledCount;

  const canSubmit = !!selectedCustomer && amountNum > 0 && amountNum <= selectedCustomer.balance + 0.005
    && !!date && !!branch && !submitting;

  const handleSubmit = async () => {
    if (!selectedCustomer || !canSubmit) return;
    setError("");
    setSubmitting(true);
    const err = await onSubmit({
      customerKey: selectedCustomer.key,
      amount: amountNum,
      method,
      date,
      branch,
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
          <h3 className={styles.title}>Record Collection</h3>
          <button onClick={onClose} className={styles.closeButton}><XIcon /></button>
        </div>

        {!selectedCustomer ? (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer..."
              className={styles.searchInput}
              autoFocus
            />
            <div className={styles.customerList}>
              {filteredCustomers.length === 0 ? (
                <div className={styles.emptyText}>No customers with an outstanding balance.</div>
              ) : filteredCustomers.map((c) => (
                <button key={c.key} onClick={() => setSelectedKey(c.key)} className={styles.customerRow}>
                  <div>
                    <div className={styles.customerName}>{c.name}</div>
                    <div className={styles.customerSub}>{c.invoiceCount} invoice{c.invoiceCount !== 1 ? "s" : ""}</div>
                  </div>
                  <span className={styles.customerBalance}>{fmt(c.balance)}</span>
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setSelectedKey(null)} className={styles.changeCustomerButton}>
              &larr; {selectedCustomer.name} &middot; {fmt(selectedCustomer.balance)} outstanding
            </button>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>Amount</label>
                <div className={styles.amountRow}>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(""); }}
                    placeholder="0"
                    className={`${styles.input} ${styles.inputMono}`}
                  />
                  <button
                    type="button"
                    onClick={() => { setAmount(String(selectedCustomer.balance)); setError(""); }}
                    className={styles.payFullButton}
                  >
                    Pay full balance
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>Collection Date</label>
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(""); }} className={styles.input} />
                {date !== today() && (
                  <div className={styles.warningText}>This will change the Sales Report for {formatDateShort(date)}.</div>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Received At</label>
                <select value={branch} onChange={(e) => { setBranch(e.target.value); setError(""); }} className={styles.input}>
                  <option value="">Select outlet...</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Payment Method</label>
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
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {method === "check" && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Check Date</label>
                  <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} className={styles.input} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Check Number</label>
                  <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className={styles.input} placeholder="Optional" />
                </div>
              </div>
            )}

            {amountNum > 0 && fifoPreview.length > 0 && (
              <div className={styles.previewCard}>
                <div className={styles.previewTitle}>Applies to (oldest first)</div>
                {touchedRows.map(({ t, before, applied }) => (
                  <div key={t.id} className={styles.previewRow}>
                    <div className={styles.previewInvoice}>
                      <div>{formatDateShort(t.date)} &middot; {t.invoice || "—"}</div>
                      <div className={styles.previewSub}>Bal {fmt(before)} &rarr; {fmt(Math.max(0, before - applied))}</div>
                    </div>
                    <span className={`${styles.previewChip} ${applied >= before - 0.005 ? styles.chipSettle : styles.chipPartial}`}>
                      {applied >= before - 0.005 ? "Settles" : "Partial"}
                    </span>
                  </div>
                ))}
                {untouchedRows.length > 0 && (
                  <div className={styles.previewMuted}>{untouchedRows.length} invoice(s) untouched</div>
                )}
                <div className={styles.previewFooter}>
                  Applies {fmt(Math.min(amountNum, selectedCustomer.balance))} across {touchedRows.length} invoice(s).
                  {" "}{fmt(Math.max(0, selectedCustomer.balance - amountNum))} still outstanding after this.
                </div>
              </div>
            )}

            {amountNum > selectedCustomer.balance + 0.005 && (
              <p className={styles.error}>Exceeds {fmt(selectedCustomer.balance)} outstanding.</p>
            )}
            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
              <button onClick={handleSubmit} disabled={!canSubmit} className={styles.submitButton}>
                {submitting ? "Recording..." : `Collect${settledCount + partialCount > 0 ? ` (${settledCount} settled${partialCount > 0 ? `, ${partialCount} partial` : ""})` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
