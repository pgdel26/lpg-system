import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { EditIcon, TrashIcon, XIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import type { SaleTransaction } from "../lib/types";
import styles from "./ReceivablesPage.module.css";

interface EditData {
  invoice: string;
  customerName: string;
  discount: number;
  totalAmount: number;
  paymentType: string;
}

interface ReceivablesPageProps {
  arTransactions: SaleTransaction[];
  onMarkCollected: (saleId: string, method?: string) => Promise<void>;
  onUpdateSale: (saleId: string, data: { invoice?: string; customerName?: string; discount?: number; totalAmount?: number; paymentType?: string }) => Promise<void>;
  onDeleteSale: (saleId: string) => Promise<void>;
}

export default function ReceivablesPage({ arTransactions, onMarkCollected, onUpdateSale, onDeleteSale }: ReceivablesPageProps) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending"); // "all", "pending", "collected"
  const [pendingCollect, setPendingCollect] = useState<SaleTransaction | null>(null);
  const [collectionMethod, setCollectionMethod] = useState("cash");
  const [pendingDelete, setPendingDelete] = useState<SaleTransaction | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({ invoice: "", customerName: "", discount: 0, totalAmount: 0, paymentType: "ar" });

  const filtered = useMemo(() => {
    let list = [...arTransactions];
    if (filterFrom) list = list.filter((t) => t.date >= filterFrom);
    if (filterTo) list = list.filter((t) => t.date <= filterTo);
    if (statusFilter === "pending") list = list.filter((t) => !t.arCollected);
    if (statusFilter === "collected") list = list.filter((t) => t.arCollected);
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return tB - tA;
    });
    return list;
  }, [arTransactions, filterFrom, filterTo, statusFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { date: string; items: SaleTransaction[] }[] = [];
    let currentDate: string | null = null;
    for (const t of filtered) {
      if (t.date !== currentDate) {
        currentDate = t.date;
        groups.push({ date: t.date, items: [] });
      }
      groups[groups.length - 1].items.push(t);
    }
    return groups;
  }, [filtered]);

  const totalPending = useMemo(() =>
    arTransactions.filter((t) => !t.arCollected).reduce((sum, t) => sum + (t.totalAmount || 0), 0),
    [arTransactions]
  );

  const totalCollected = useMemo(() =>
    arTransactions.filter((t) => t.arCollected).reduce((sum, t) => sum + (t.totalAmount || 0), 0),
    [arTransactions]
  );

  const startEdit = (t: SaleTransaction) => {
    setEditingId(t.id);
    setEditData({
      invoice: t.invoice || "",
      customerName: t.customerName || "",
      discount: t.discount || 0,
      totalAmount: t.totalAmount || 0,
      paymentType: t.paymentType || "ar",
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    onUpdateSale(editingId, editData);
    setEditingId(null);
    setEditData({ invoice: "", customerName: "", discount: 0, totalAmount: 0, paymentType: "ar" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ invoice: "", customerName: "", discount: 0, totalAmount: 0, paymentType: "ar" });
  };

  return (
    <div className="animate-fade">
      {/* Summary cards */}
      <div className={styles.summaryCards}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Pending</div>
          <div className={styles.summaryValueRed}>{fmt(totalPending)}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total Collected</div>
          <div className={styles.summaryValueGreen}>{fmt(totalCollected)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
          className={styles.filterInput} />
        <span className={styles.filterSep}>to</span>
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
          className={styles.filterInput} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.filterSelect}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="collected">Collected</option>
        </select>
      </div>

      {/* AR list grouped by date */}
      {grouped.length > 0 ? grouped.map((group) => (
        <div key={group.date} className={styles.dateGroup}>
          <div className={styles.dateGroupLabel}>
            {new Date(group.date + "T00:00:00").toLocaleDateString("en-PH", {
              weekday: "short", year: "numeric", month: "short", day: "numeric",
            })}
          </div>
          <div className={styles.tableCard}>
            {/* Header */}
            <div className={styles.tableHeader}>
              <span>Invoice</span>
              <span>Customer</span>
              <span>Product</span>
              <span className={styles.alignRight}>Amount</span>
              <span className={styles.alignCenter}>Check</span>
              <span className={styles.alignCenter}>Status</span>
              <span className={styles.alignCenter}>Actions</span>
            </div>

            {group.items.map((t) => (
              editingId === t.id ? (
                <div key={t.id} className={styles.editRow}>
                  <div className={styles.editFields}>
                    <div className={styles.editFieldFlex}>
                      <span className={styles.editFieldLabel}>Invoice</span>
                      <input value={editData.invoice} onChange={(e) => setEditData((p) => ({ ...p, invoice: e.target.value }))}
                        className={styles.editInput} />
                    </div>
                    <div className={styles.editFieldFlex}>
                      <span className={styles.editFieldLabel}>Customer</span>
                      <input value={editData.customerName} onChange={(e) => setEditData((p) => ({ ...p, customerName: e.target.value }))}
                        className={styles.editInput} />
                    </div>
                    <div className={styles.editFieldShort}>
                      <span className={styles.editFieldLabel}>Discount</span>
                      <input type="number" value={editData.discount} onChange={(e) => {
                        const disc = parseFloat(e.target.value) || 0;
                        setEditData((p) => ({ ...p, discount: disc }));
                      }} className={`${styles.editInput} ${styles.editInputMono}`} />
                    </div>
                    <div className={styles.editFieldMed}>
                      <span className={styles.editFieldLabel}>Total Amount</span>
                      <input type="number" value={editData.totalAmount} onChange={(e) => {
                        setEditData((p) => ({ ...p, totalAmount: parseFloat(e.target.value) || 0 }));
                      }} className={`${styles.editInput} ${styles.editInputMono}`} />
                    </div>
                  </div>
                  <div className={styles.editActions}>
                    <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                    <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className={styles.tableRow}>
                  <span className={styles.invoiceCell}>
                    {t.invoice || "\u2014"}
                  </span>
                  <span className={styles.customerCell}>
                    {t.customerName || "\u2014"}
                  </span>
                  <span className={styles.productCell}>
                    {t.product || "\u2014"}
                    {t.quantity > 1 && <span className={styles.qtyHint}> x{t.quantity}</span>}
                  </span>
                  <span className={styles.amountCell}>
                    {fmt(t.totalAmount)}
                  </span>
                  <span className={styles.checkCell}>
                    {t.checkDate ? (
                      <span title={`Check: ${fmt(t.checkAmount)} on ${t.checkDate}`}>
                        {t.checkDate}
                      </span>
                    ) : "\u2014"}
                  </span>
                  <div className={styles.statusCell}>
                    {t.arCollected ? (
                      <span className={styles.collectedBadge}>
                        {t.collectionMethod === "check" ? "Check" : "Cash"}
                      </span>
                    ) : (
                      <button
                        onClick={() => setPendingCollect(t)}
                        className={styles.markCollectedButton}
                      >
                        Mark Collected
                      </button>
                    )}
                  </div>
                  <div className={styles.actionsCell}>
                    <button onClick={() => startEdit(t)} className={styles.iconButton} title="Edit">
                      <EditIcon />
                    </button>
                    <button onClick={() => setPendingDelete(t)} className={styles.iconButton} title="Delete">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateText}>
            No accounts receivable found.
          </div>
        </div>
      )}

      {pendingCollect && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) { setPendingCollect(null); setCollectionMethod("cash"); } }}
        >
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Mark as Collected
              </h3>
              <button
                onClick={() => { setPendingCollect(null); setCollectionMethod("cash"); }}
                className={styles.modalCloseButton}
              >
                <XIcon />
              </button>
            </div>

            <p className={styles.modalBody}>
              Mark {fmt(pendingCollect.totalAmount)} from &quot;{pendingCollect.customerName || "Unknown"}&quot; (Invoice: {pendingCollect.invoice || "N/A"}) as collected?
            </p>

            <div className={styles.paymentMethodSection}>
              <div className={styles.paymentMethodLabel}>
                Payment Method
              </div>
              <div className={styles.paymentMethodOptions}>
                {[
                  { value: "cash", label: "Cash", color: "#22c55e" },
                  { value: "check", label: "Check", color: "#3b82f6" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setCollectionMethod(opt.value)}
                    className={styles.paymentMethodButton}
                    style={{
                      border: collectionMethod === opt.value ? `2px solid ${opt.color}` : "2px solid var(--border-light)",
                      background: collectionMethod === opt.value ? `${opt.color}11` : "transparent",
                      color: collectionMethod === opt.value ? opt.color : "var(--text-muted)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={() => { setPendingCollect(null); setCollectionMethod("cash"); }}
                className={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={() => { onMarkCollected(pendingCollect.id, collectionMethod); setPendingCollect(null); setCollectionMethod("cash"); }}
                className={styles.collectButton}
              >
                Collect
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete AR Transaction"
          message={`Delete ${fmt(pendingDelete.totalAmount)} from "${pendingDelete.customerName || "Unknown"}" (Invoice: ${pendingDelete.invoice || "N/A"})? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeleteSale(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
