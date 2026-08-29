import { useEffect, useState } from "react";
import { fmt } from "../../lib/utils";
import { PhoneIcon, EditIcon, TrashIcon, ChevronLeftIcon, HistoryIcon } from "../../components/Icons";
import ConfirmModal from "../../components/ConfirmModal";
import type { Customer, CustomerCategory, CustomerTransaction } from "../../lib/types";
import styles from "./CustomerDetail.module.css";

const TYPE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  sale: { label: "Sale", bg: "rgba(16,185,129,0.08)", color: "#10b981" },
  swap: { label: "Swap", bg: "rgba(245,158,11,0.08)", color: "#f59e0b" },
  refund: { label: "Refund", bg: "rgba(239,68,68,0.08)", color: "#ef4444" },
};

interface CustomerDetailProps {
  customer: Customer;
  customerCategories: CustomerCategory[];
  onBack: () => void;
  onUpdateCustomer: (
    customerId: string,
    data: { name: string; phone: string; categoryId?: string },
  ) => Promise<boolean>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  onFetchCustomerTransactions: (customerId: string) => Promise<CustomerTransaction[]>;
}

export default function CustomerDetail({
  customer,
  customerCategories,
  onBack,
  onUpdateCustomer,
  onDeleteCustomer,
  onFetchCustomerTransactions,
}: CustomerDetailProps) {
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  // Starts true and is only ever turned off: the parent mounts this component
  // with a `key` of the customer id, so opening a different customer remounts
  // it rather than re-running a fetch against stale rows on screen.
  const [loadingTx, setLoadingTx] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(customer.name || "");
  const [editPhone, setEditPhone] = useState(customer.phone || "");
  const [editCategory, setEditCategory] = useState(customer.categoryId || "");
  const [pendingDelete, setPendingDelete] = useState(false);

  // Fetched here rather than by the parent before navigating: the detail screen
  // is what needs them, and `cancelled` stops a slow response from landing on a
  // customer the operator has already moved away from.
  useEffect(() => {
    let cancelled = false;
    onFetchCustomerTransactions(customer.id).then((txs) => {
      if (cancelled) return;
      setTransactions(txs);
      setLoadingTx(false);
    });
    return () => { cancelled = true; };
  }, [customer.id, onFetchCustomerTransactions]);

  const startEdit = () => {
    setEditName(customer.name || "");
    setEditPhone(customer.phone || "");
    setEditCategory(customer.categoryId || "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    const ok = await onUpdateCustomer(customer.id, {
      name: editName, phone: editPhone, categoryId: editCategory,
    });
    if (!ok) return; // rejected — leave the form open so the toast is legible
    setEditing(false);
  };

  const categoryLabel = customerCategories.find((c) => c.id === customer.categoryId)?.name;

  const getTxDescription = (tx: CustomerTransaction) => {
    if (tx.type === "sale") return `${tx.product || "Item"} x${tx.quantity || 1}`;
    if (tx.type === "swap") return `${tx.productFrom || "?"} → ${tx.productTo || "?"}`;
    if (tx.type === "refund") {
      return `${tx.product || tx.saleSection || "Refund"}${tx.quantity ? ` x${tx.quantity}` : ""}`;
    }
    return "";
  };

  const getTxAmount = (tx: CustomerTransaction): number => {
    if (tx.type === "sale") return (tx.totalAmount as number) || 0;
    if (tx.type === "swap") return (tx.price as number) || 0;
    if (tx.type === "refund") return (tx.totalRefund as number) || (tx.refundAmount as number) || 0;
    return 0;
  };

  return (
    <div className="animate-fade">
      <button onClick={onBack} className={styles.backButton}>
        <ChevronLeftIcon /> Back to Customers
      </button>

      <div className={styles.detailCard}>
        <div className={styles.detailCardHeader}>
          <div>
            <h2 className={styles.detailName}>{customer.name}</h2>
            <div className={styles.detailPhoneRow}>
              <PhoneIcon />
              <span className={styles.detailPhone}>{customer.phone || "—"}</span>
              {categoryLabel && <span className={styles.categoryBadge}>{categoryLabel}</span>}
            </div>
          </div>
          <div className={styles.detailActions}>
            <button onClick={startEdit} className={styles.editButton}>
              <EditIcon /> Edit
            </button>
            <button onClick={() => setPendingDelete(true)} className={styles.deleteButton}>
              <TrashIcon /> Delete
            </button>
          </div>
        </div>

        {editing && (
          <div className={styles.inlineEditSection}>
            <div className={styles.inlineEditFields}>
              <div className={styles.inlineEditField}>
                <span className={styles.editFieldLabel}>Name</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
                  autoFocus
                  className={styles.editInput}
                />
              </div>
              <div className={styles.inlineEditField}>
                <span className={styles.editFieldLabel}>Phone</span>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
                  className={styles.editInput}
                />
              </div>
              <div className={styles.inlineEditField}>
                <span className={styles.editFieldLabel}>Category</span>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className={styles.editInput}
                >
                  <option value="">Uncategorised</option>
                  {customerCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.editButtonGroup}>
                <button onClick={() => setEditing(false)} className={styles.cancelButton}>Cancel</button>
                <button onClick={saveEdit} className={styles.saveButton}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.txHistoryCard}>
        <div className={styles.txHistoryHeader}>
          <HistoryIcon />
          <span className={styles.txHistoryTitle}>Transaction History</span>
          {!loadingTx && <span className={styles.txCount}>({transactions.length})</span>}
        </div>

        {loadingTx ? (
          <div className={styles.txLoading}>Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className={styles.txEmpty}>No transactions found for this customer.</div>
        ) : (
          transactions.map((tx) => {
            const txStyle = TYPE_STYLES[tx.type as string] || TYPE_STYLES.sale;
            return (
              <div key={tx.id} className={styles.txRow}>
                <div className={styles.txLeft}>
                  {/* tx badge: bg/color are data-driven — kept inline */}
                  <span
                    className={styles.txTypeBadge}
                    style={{ background: txStyle.bg, color: txStyle.color }}
                  >
                    {txStyle.label}
                  </span>
                  <span className={styles.txDesc}>{getTxDescription(tx)}</span>
                </div>
                <div className={styles.txRight}>
                  {/* amount color is data-driven (refund = red) — kept inline */}
                  <span
                    className={styles.txAmount}
                    style={{ color: tx.type === "refund" ? "#f87171" : "var(--text-primary)" }}
                  >
                    {tx.type === "refund" ? "-" : ""}{fmt(getTxAmount(tx))}
                  </span>
                  <span className={styles.txDate}>{(tx.date as string) || ""}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Delete Customer"
          message={`Are you sure you want to delete "${customer.name}"? This will also delete all sales, swaps, and refunds linked to this customer. This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeleteCustomer(customer.id); setPendingDelete(false); onBack(); }}
          onCancel={() => setPendingDelete(false)}
        />
      )}
    </div>
  );
}
