import { useState, useMemo } from "react";
import { fmt, formatDateShort } from "../lib/utils";
import { paymentSplit } from "../lib/payments";
import { arStatus, arCollectionEvents, collectionMethodLabel, batchSummary, arMethodLabel, collectionBatches, type CollectionBatch } from "../lib/receivables";

import { EditIcon, TrashIcon, PlusIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import RecordCollectionModal from "../components/RecordCollectionModal";
import CollectionsList from "../components/CollectionsList";
import EditCollectionModal from "../components/EditCollectionModal";
import TopDebtorsChart from "./TopDebtorsChart";
import ArSummaryTab from "./receivables/ArSummaryTab";
import type { SaleTransaction, Branch } from "../lib/types";
import type { RecordArCollectionInput, EditArCollectionInput } from "../lib/hooks/useReceivablesData";
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

interface PendingVoid {
  batchId: string;
  amount: number;
  invoiceCount: number;
  date: string;
  method?: string;
}

interface ReceivablesPageProps {
  arTransactions: SaleTransaction[];
  branches: Branch[];
  onRecordCollection: (input: RecordArCollectionInput) => Promise<string | null>;
  onVoidCollection: (batchId: string) => Promise<void>;
  onEditCollection: (batchId: string, input: EditArCollectionInput) => Promise<string | null>;
  onUpdateSale: (saleId: string, data: { invoice?: string; customerName?: string; discount?: number; totalAmount?: number; paymentType?: string }) => Promise<void>;
  onDeleteSale: (saleId: string) => Promise<void>;
}

const subTabs = [
  { key: "summary", label: "Summary" },
  { key: "transactions", label: "Transactions" },
];

export default function ReceivablesPage({ arTransactions, branches, onRecordCollection, onVoidCollection, onEditCollection, onUpdateSale, onDeleteSale }: ReceivablesPageProps) {
  const [subTab, setSubTab] = useState("summary");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("outstanding"); // "all", "outstanding", "pending", "partial", "collected"
  const [customerFilter, setCustomerFilter] = useState("");
  // Two sortable columns now, so direction alone is no longer enough state —
  // which column is active has to be tracked too.
  const [sortKey, setSortKey] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Clicking the active column flips direction; clicking a different one
  // switches to it and starts at desc (newest / largest first), which is the
  // useful default for both columns.
  const toggleSort = (key: "date" | "amount") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingVoid, setPendingVoid] = useState<PendingVoid | null>(null);
  const [editingCollection, setEditingCollection] = useState<CollectionBatch | null>(null);
  const [visibleCollectionCount, setVisibleCollectionCount] = useState(ROWS_PER_PAGE);
  const [pendingDelete, setPendingDelete] = useState<SaleTransaction | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({ invoice: "", customerName: "", discount: 0, totalAmount: 0, paymentType: "ar" });

  const branchName = (id?: string): string => branches.find((b) => b.id === id)?.name || id || "—";

  const filtered = useMemo(() => {
    let list = [...arTransactions];
    if (filterFrom) list = list.filter((t) => t.date >= filterFrom);
    if (filterTo) list = list.filter((t) => t.date <= filterTo);
    if (statusFilter === "outstanding") list = list.filter((t) => arStatus(t).status !== "collected");
    if (statusFilter === "pending") list = list.filter((t) => arStatus(t).status === "pending");
    if (statusFilter === "partial") list = list.filter((t) => arStatus(t).status === "partial");
    if (statusFilter === "collected") list = list.filter((t) => arStatus(t).status === "collected");
    if (customerFilter.trim()) {
      const q = customerFilter.trim().toLowerCase();
      list = list.filter((t) => (t.customerName || "").toLowerCase().includes(q));
    }
    // Date is the secondary key for amount sorting (and the tiebreaker within a
    // date), so both orderings stay deterministic instead of depending on the
    // incoming array order.
    const byDate = (a: SaleTransaction, b: SaleTransaction) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    };
    if (sortKey === "amount") {
      // Sorts on REMAINING balance, not the original invoice amount. The default
      // filter is "outstanding" and totalPending below is remaining-based, so
      // ordering by arTotal would rank a ₱48k invoice with ₱500 left above a
      // fully unpaid ₱20k one — and since only ROWS_PER_PAGE rows render at a
      // time, it can push the genuinely largest debts out of view entirely.
      // arTotal breaks ties so equal balances still order sensibly.
      // arStatus() walks each doc's collection events, so precompute once per
      // doc rather than calling it the O(n log n) times a comparator would.
      const amountOf = new Map(list.map((t) => {
        const s = arStatus(t);
        return [t.id, { remaining: s.remaining, arTotal: s.arTotal }];
      }));
      const dir = sortDir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        const sa = amountOf.get(a.id), sb = amountOf.get(b.id);
        const diff = (sa?.remaining || 0) - (sb?.remaining || 0);
        if (diff !== 0) return dir * diff;
        const tie = (sa?.arTotal || 0) - (sb?.arTotal || 0);
        return tie !== 0 ? dir * tie : byDate(a, b);
      });
    } else {
      const dir = sortDir === "asc" ? 1 : -1;
      list.sort((a, b) => dir * byDate(a, b));
    }
    return list;
  }, [arTransactions, filterFrom, filterTo, statusFilter, customerFilter, sortKey, sortDir]);

  // Lazy-load the rendered list: only the current window of rows is in the
  // DOM. Resets whenever the filters/sort change so a new view doesn't
  // inherit a stale scroll depth — done during render (React's documented
  // pattern for "adjusting state when a prop changes"), not in an effect,
  // so the stale-count frame never paints.
  const filterKey = `${filterFrom}|${filterTo}|${statusFilter}|${customerFilter}|${sortKey}|${sortDir}`;
  const [visibleRowCount, setVisibleRowCount] = useState(ROWS_PER_PAGE);
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisibleRowCount(ROWS_PER_PAGE);
    setVisibleCollectionCount(ROWS_PER_PAGE);
  }
  const visibleRows = filtered.slice(0, visibleRowCount);
  const hasMoreRows = filtered.length > visibleRowCount;

  // Remaining balance, not the doc's full AR portion — a partially collected
  // invoice must only count what's still actually owed.
  const totalPending = useMemo(() =>
    arTransactions.reduce((sum, t) => sum + arStatus(t).remaining, 0),
    [arTransactions]
  );

  // One row per collection, filtered on the COLLECTION's own date — not the
  // invoice date the table below uses. They are genuinely different axes: an
  // invoice raised in June can be paid in August, and an operator asking "what
  // came in on the 25th" means the payment, not the sale. The status filter is
  // deliberately not applied here; "outstanding"/"collected" describe an
  // invoice's state, and have no meaning for a payment that already happened.
  const collectionRows = useMemo(() => {
    const rows = collectionBatches(arTransactions, {
      ...(filterFrom ? { startDate: filterFrom } : {}),
      ...(filterTo ? { endDate: filterTo } : {}),
    });
    const q = customerFilter.trim().toLowerCase();
    return q ? rows.filter((b) => b.customerName.toLowerCase().includes(q)) : rows;
  }, [arTransactions, filterFrom, filterTo, customerFilter]);

  const collectionsTotal = collectionRows.reduce((sum, b) => sum + b.amount, 0);

  // Windowed like the A/R table below it. With no date filter set — the default
  // on this page — collectionRows is every collection ever recorded (486 today
  // and only growing), and rendering all of them unvirtualised above a table
  // that deliberately caps itself at 50 rows would make the default view of
  // this subtab the slowest screen in the app. The header total stays computed
  // over the FULL filtered set, so the summary figure is never a partial sum of
  // whatever happens to be rendered.
  const visibleCollections = collectionRows.slice(0, visibleCollectionCount);

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
      <div className={styles.subTabs}>
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`${styles.subTab} ${subTab === t.key ? styles.subTabActive : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.card}>
      {subTab === "summary" && <ArSummaryTab arTransactions={arTransactions} />}

      {subTab === "transactions" && (
      <>
      {/* Summary */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryLabel}>Total Pending (All Outlets)</div>
        <div className={styles.summaryValueRed}>{fmt(totalPending)}</div>
      </div>

      {/* Filters + Record Collection */}
      <div className={styles.filters}>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
          className={styles.filterInput} />
        <span className={styles.filterSep}>to</span>
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
          className={styles.filterInput} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.filterSelect}>
          <option value="all">All</option>
          <option value="outstanding">Outstanding</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="collected">Collected</option>
        </select>
        <input type="text" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}
          placeholder="Filter by customer..." className={styles.filterInput} />
        <button onClick={() => setRecordModalOpen(true)} className={styles.recordCollectionButton}>
          <PlusIcon /> Record Collection
        </button>
      </div>

      <div className={styles.pageLayout}>
        <div className={styles.mainColumn}>
          {/* Collections.
              A collection is a transaction in its own right, and until now the
              only way to see one was to guess which invoice it hit and expand
              that row. Listing them here — one row per payment, not per
              invoice-slice — is what makes a mis-keyed method visible at all.
              The date filters read as COLLECTION dates here; see
              collectionRows above for why that differs from the table below. */}
          <div className={styles.tableCard}>
            <div className={styles.collectionsHeader}>
              <h3 className={styles.collectionsTitle}>Collections</h3>
              {/* "all methods" said out loud: this is a receivables ledger, so
                  every method belongs here — but the same page's remit-facing
                  figures are cash-only, and an unlabelled peso total invites
                  the reader to reconcile the two. */}
              <span className={styles.collectionsTotal}>
                {collectionRows.length} collection{collectionRows.length !== 1 ? "s" : ""} &middot; {fmt(collectionsTotal)} &middot; all methods
              </span>
            </div>
            <CollectionsList
              batches={visibleCollections}
              branches={branches}
              onEdit={setEditingCollection}
              onVoid={(b) => setPendingVoid({ batchId: b.batchId, amount: b.amount, invoiceCount: b.invoices.length, date: b.date, method: b.method })}
              emptyText="No collections match these filters."
              showBranch
            />
            {collectionRows.length > visibleCollectionCount && (
              <button
                onClick={() => setVisibleCollectionCount((n) => n + ROWS_PER_PAGE)}
                className={styles.loadMoreButton}
              >
                Load More
              </button>
            )}
          </div>

          {/* AR table */}
          {filtered.length > 0 ? (
          <div className={styles.tableCard}>
            {/* Header */}
            <div className={styles.tableHeader}>
              <button
                onClick={() => toggleSort("date")}
                className={styles.sortableHeader}
              >
                {/* Arrow only on the active column — with two sortable headers,
                    showing one on each would leave the active sort ambiguous. */}
                Date {sortKey === "date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </button>
              <span>Invoice</span>
              <span>Customer</span>
              <span>Product</span>
              <button
                onClick={() => toggleSort("amount")}
                className={`${styles.sortableHeader} ${styles.sortableHeaderRight}`}
              >
                Amount {sortKey === "amount" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </button>
              <span className={styles.alignCenter}>Check</span>
              <span className={styles.alignCenter}>Status</span>
              <span className={styles.alignCenter}>Actions</span>
            </div>

            {visibleRows.map((t) => {
              // A doc with a payments array can't be safely inline-edited —
              // changing discount/total/paymentType would desync it from
              // the per-row payment allocation. Delete and re-record instead.
              // `!!t.payments`, matching DailySalesTab: a doc with an EMPTY
              // payments array is still a doc the modern writer produced, and
              // letting it through to a raw totalAmount edit would desync that
              // total from the doc's own discount/delivery/tax fields.
              const isSplitPayment = !!t.payments;
              const status = arStatus(t);
              const hasCollections = status.collected > 0;
              const events = arCollectionEvents(t);
              const hasHistory = events.length > 0;
              const isExpanded = expandedId === t.id;
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
                <div key={t.id}>
                  <div className={styles.tableRow}>
                    <span className={styles.dateCell}>
                      {formatDateShort(t.date)}
                    </span>
                    <span className={styles.invoiceCell}>
                      {t.invoice || "—"}
                    </span>
                    <span className={styles.customerCell}>
                      {t.customerName || "—"}
                    </span>
                    <span className={styles.productCell}>
                      {t.product || "—"}
                      {t.quantity > 1 && <span className={styles.qtyHint}> x{t.quantity}</span>}
                    </span>
                    <span className={styles.amountCell}>
                      {fmt(status.arTotal)}
                      {status.status === "partial" && (
                        <span className={styles.balanceHint}>Bal {fmt(status.remaining)}</span>
                      )}
                    </span>
                    <span className={styles.checkCell}>
                      {t.checkDate ? (
                        <span title={`Check: ${fmt(t.checkAmount)} on ${t.checkDate}`}>
                          {t.checkDate}
                        </span>
                      ) : "—"}
                    </span>
                    <div className={styles.statusCell}>
                      {hasHistory ? (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className={
                            status.status === "collected" ? styles.collectedBadge
                              : status.status === "partial" ? styles.partialBadge
                              : styles.pendingBadge
                          }
                        >
                          {status.status === "collected" ? (collectionMethodLabel(t) ?? "Collected")
                            : status.status === "partial" ? "Partial" : "Pending"}
                        </button>
                      ) : (
                        <span className={styles.pendingBadge}>Pending</span>
                      )}
                    </div>
                    <div className={styles.actionsCell}>
                      {isSplitPayment || hasCollections ? (
                        <button
                          disabled
                          className={`${styles.iconButton} ${styles.iconButtonDisabled}`}
                          title={hasCollections ? "Has collections — void them first" : "Split payment — delete and re-record to change"}
                        >
                          <EditIcon />
                        </button>
                      ) : (
                        <button onClick={() => startEdit(t)} className={styles.iconButton} title="Edit">
                          <EditIcon />
                        </button>
                      )}
                      <button
                        onClick={() => setPendingDelete(t)}
                        disabled={hasCollections}
                        className={`${styles.iconButton} ${hasCollections ? styles.iconButtonDisabled : ""}`}
                        title={hasCollections ? "Has collections — void them first" : "Delete"}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  {isExpanded && events.length > 0 && (
                    <div className={styles.historyPanel}>
                      {events.map((e, i) => (
                        <div key={`${e.batchId}-${i}`} className={e.voided ? `${styles.historyRow} ${styles.historyRowVoided}` : styles.historyRow}>
                          <span className={styles.historyText}>
                            {e.date ? formatDateShort(e.date) : "—"} &middot; {arMethodLabel(e.method)} &middot; {fmt(e.amount)} &middot; {branchName(e.branch)}
                            {e.notes && <span className={styles.eventNote}> &middot; {e.notes}</span>}
                          </span>
                          {e.voided ? (
                            <span className={styles.voidedLabel}>Voided</span>
                          ) : (
                            <button
                              onClick={() => {
                                const summary = batchSummary(arTransactions, e.batchId || "");
                                setPendingVoid({ batchId: e.batchId || "", amount: summary.amount, invoiceCount: summary.invoiceCount, date: e.date || "", method: summary.method });
                              }}
                              className={styles.voidButton}
                            >
                              Void
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
      </>
      )}
      </div>

      {recordModalOpen && (
        <RecordCollectionModal
          arTransactions={arTransactions}
          branches={branches}
          onSubmit={onRecordCollection}
          onClose={() => setRecordModalOpen(false)}
        />
      )}

      {editingCollection && (
        <EditCollectionModal
          collection={editingCollection}
          branches={branches}
          onSubmit={onEditCollection}
          onClose={() => setEditingCollection(null)}
        />
      )}

      {pendingVoid && (
        <ConfirmModal
          title="Void Collection"
          message={
            `This reopens ${pendingVoid.invoiceCount} invoice(s) totaling ${fmt(pendingVoid.amount)}` +
            (pendingVoid.method === "cash" && pendingVoid.date
              ? ` and reduces ${formatDateShort(pendingVoid.date)}'s Expected Cash Remit by that amount.`
              : pendingVoid.method === "cash"
              ? ". It has no recorded collection date, so it never counted toward any day's cash remit."
              : `. It was collected by ${arMethodLabel(pendingVoid.method).toLowerCase()}, so it never counted toward any day's cash remit.`) +
            " This cannot be undone."
          }
          confirmLabel="Void"
          onConfirm={() => { onVoidCollection(pendingVoid.batchId); setPendingVoid(null); }}
          onCancel={() => setPendingVoid(null)}
        />
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
