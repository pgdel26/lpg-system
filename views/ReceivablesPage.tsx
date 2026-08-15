import { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { paymentSplit } from "../lib/payments";
import { EditIcon, TrashIcon, XIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import TopDebtorsChart from "./TopDebtorsChart";
import type { SaleTransaction } from "../lib/types";
import styles from "./ReceivablesPage.module.css";

interface EditData {
  invoice: string;
  customerName: string;
  discount: number;
  totalAmount: number;
  paymentType: string;
}

// Renders this many rows at a time — the AR history only ever grows, and
// rendering every row on every visit gets slower as it does.
const ROWS_PER_PAGE = 50;

// Bare "YYYY-MM-DD" strings must be parsed with an explicit local-midnight
// time component — new Date("YYYY-MM-DD") parses as UTC and can render as
// the wrong calendar day depending on the browser's timezone.
const formatDateShort = (dateStr: string): string =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

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
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateSortDir, setDateSortDir] = useState<"asc" | "desc">("desc");
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
    if (customerFilter.trim()) {
      const q = customerFilter.trim().toLowerCase();
      list = list.filter((t) => (t.customerName || "").toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const dir = dateSortDir === "asc" ? 1 : -1;
      if (a.date !== b.date) return dir * a.date.localeCompare(b.date);
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return dir * (tA - tB);
    });
    return list;
  }, [arTransactions, filterFrom, filterTo, statusFilter, customerFilter, dateSortDir]);

  // Lazy-load the rendered list: only the current window of rows is in the
  // DOM. Resets whenever the filters/sort change so a new view doesn't
  // inherit a stale scroll depth — done during render (React's documented
  // pattern for "adjusting state when a prop changes"), not in an effect,
  // so the stale-count frame never paints.
  const filterKey = `${filterFrom}|${filterTo}|${statusFilter}|${customerFilter}|${dateSortDir}`;
  const [visibleRowCount, setVisibleRowCount] = useState(ROWS_PER_PAGE);
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisibleRowCount(ROWS_PER_PAGE);
  }
  const visibleRows = filtered.slice(0, visibleRowCount);
  const hasMoreRows = filtered.length > visibleRowCount;

  // The AR portion only, not the doc's full line total — a partially-AR sale
  // (see lib/payments.ts) must only count what's actually owed as receivable.
  const totalPending = useMemo(() =>
    arTransactions.filter((t) => !t.arCollected).reduce((sum, t) => sum + paymentSplit(t).ar, 0),
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
      {/* Summary */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryLabel}>Total Pending (All Outlets)</div>
        <div className={styles.summaryValueRed}>{fmt(totalPending)}</div>
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
        <input type="text" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}
          placeholder="Filter by customer..." className={styles.filterInput} />
      </div>

      <div className={styles.pageLayout}>
        <div className={styles.mainColumn}>
          {/* AR table */}
          {filtered.length > 0 ? (
          <div className={styles.tableCard}>
            {/* Header */}
            <div className={styles.tableHeader}>
              <button
                onClick={() => setDateSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className={styles.sortableHeader}
              >
                Date {dateSortDir === "asc" ? "\u25b2" : "\u25bc"}
              </button>
              <span>Invoice</span>
              <span>Customer</span>
              <span>Product</span>
              <span className={styles.alignRight}>Amount</span>
              <span className={styles.alignCenter}>Check</span>
              <span className={styles.alignCenter}>Status</span>
              <span className={styles.alignCenter}>Actions</span>
            </div>

            {visibleRows.map((t) => {
              // A doc with a payments array can't be safely inline-edited —
              // changing discount/total/paymentType would desync it from
              // the per-row payment allocation. Delete and re-record instead.
              const isSplitPayment = (t.payments?.length ?? 0) > 0;
              const arAmount = paymentSplit(t).ar;
              return editingId === t.id ? (
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
                  <span className={styles.dateCell}>
                    {formatDateShort(t.date)}
                  </span>
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
                    {fmt(arAmount)}
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
                    {isSplitPayment ? (
                      <button
                        disabled
                        className={`${styles.iconButton} ${styles.iconButtonDisabled}`}
                        title="Split payment — delete and re-record to change"
                      >
                        <EditIcon />
                      </button>
                    ) : (
                      <button onClick={() => startEdit(t)} className={styles.iconButton} title="Edit">
                        <EditIcon />
                      </button>
                    )}
                    <button onClick={() => setPendingDelete(t)} className={styles.iconButton} title="Delete">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateText}>
              No accounts receivable found.
            </div>
          </div>
        )}

        {hasMoreRows && (
          <button
            onClick={() => setVisibleRowCount((n) => n + ROWS_PER_PAGE)}
            className={styles.loadMoreButton}
          >
            Load More
          </button>
        )}
        </div>

        <TopDebtorsChart arTransactions={arTransactions} />
      </div>

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
              Mark {fmt(paymentSplit(pendingCollect).ar)} from &quot;{pendingCollect.customerName || "Unknown"}&quot; (Invoice: {pendingCollect.invoice || "N/A"}) as collected?
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
          message={
            pendingDelete.payments
              // Split-payment sale: deleting removes the WHOLE doc (cash/GCash portions
              // included), not just the AR slice shown on this page — say so explicitly.
              ? `Delete this ${fmt(pendingDelete.totalAmount)} sale (${fmt(paymentSplit(pendingDelete).ar)} outstanding A/R)? This removes the whole sale from ${pendingDelete.date}'s totals, not just the receivable. This cannot be undone.`
              : `Delete ${fmt(paymentSplit(pendingDelete).ar)} from "${pendingDelete.customerName || "Unknown"}" (Invoice: ${pendingDelete.invoice || "N/A"})? This cannot be undone.`
          }
          confirmLabel="Delete"
          onConfirm={() => { onDeleteSale(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
