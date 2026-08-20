import { useState, useMemo, useEffect } from "react";
import { fmt, today, presetThisMonth, presetLastMonth, formatDateShort } from "../lib/utils";
import { PlusIcon, EditIcon, TrashIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import { purchaseCost } from "../lib/reports/purchaseCost";
import type { Purchase, Branch, PurchaseDelivery } from "../lib/types";
import styles from "./PurchasesPage.module.css";

interface EditData {
  quantity: number;
  unitCost: number;
  totalCost: number;
}

// A row displayed in the table — either a real purchase, or a transfer's
// two-doc pair merged into one (see recordTransfer in usePurchasesData.ts).
interface DisplayRow {
  key: string;
  date: string;
  createdAtSeconds: number;
  product: string;
  /** Only meaningful for a transfer row ("Transfer: PILI → CADLAN") — a plain purchase has no route to show. */
  transferLabel?: string;
  isTransfer: boolean;
  quantity: number;
  /** Legacy per-line costs. Absent on anything recorded since cost moved to the
   *  delivery — rendered as "—", never 0, which would read as free stock. */
  unitCost?: number;
  totalCost?: number;
  /** The figure actually shown in the cost column: this line's delivery total on
   *  the delivery's FIRST line, its own legacy totalCost for pre-delivery docs,
   *  and undefined on a delivery's subsequent lines so the total is not repeated
   *  (and cannot be mistaken for a per-product amount, or summed by eye). */
  deliveryCost?: number;
  /** Which purchaseDelivery this line belongs to; absent for pre-delivery docs. */
  deliveryId?: string;
  /** Present for real purchases (and the legacy-fallback transfer case) — drives Edit/Delete. */
  purchase?: Purchase;
  /** Present for a properly-paired transfer — Delete removes both docs via this. */
  transferGroupId?: string;
}

/** The table renders a flat list of these: a delivery contributes one header
 *  carrying its cost plus one row per product; a pre-delivery purchase
 *  contributes a single row carrying its own line cost. */
type DisplayItem =
  | {
      kind: "deliveryHeader";
      key: string;
      date: string;
      totalCost?: number;
      /** No cost entered for this delivery yet — the header says so instead of
       *  showing the placeholder 0. See PurchaseDelivery.costPending. */
      costPending?: boolean;
      lineCount: number;
      itemCount: number;
    }
  | { kind: "row"; row: DisplayRow };

interface PendingDelete {
  message: string;
  onConfirm: () => void;
}

const subTabs = [
  { key: "purchases", label: "Purchases" },
  { key: "transfers", label: "Transfers" },
] as const;

interface PurchasesPageProps {
  purchaseTransactions: Purchase[];
  purchaseDeliveries: PurchaseDelivery[];
  branches: Branch[];
  hasMorePurchases: boolean;
  loadingMorePurchases: boolean;
  onLoadMorePurchases: () => void;
  /** One-time range query — see usePurchasesData's doc for why the From/To filters need this instead of filtering purchaseTransactions. */
  fetchPurchasesInRange: (from: string, to: string) => Promise<{ purchases: Purchase[]; truncated: boolean }>;
  /** Bumped by the hook after any mutation — refetches the active range query so it doesn't go stale after an edit/delete. */
  purchasesVersion: number;
  onOpenPurchaseModal: () => void;
  onUpdatePurchase: (purchaseId: string, data: { quantity: number; unitCost: number; totalCost: number }) => Promise<void>;
  onDeletePurchase: (purchaseId: string) => Promise<void>;
  onDeleteTransfer: (transferGroupId: string) => Promise<void>;
}

export default function PurchasesPage({
  purchaseTransactions, purchaseDeliveries,
  branches,
  hasMorePurchases,
  loadingMorePurchases,
  onLoadMorePurchases,
  fetchPurchasesInRange,
  purchasesVersion,
  onOpenPurchaseModal,
  onUpdatePurchase,
  onDeletePurchase,
  onDeleteTransfer,
}: PurchasesPageProps) {
  const [subTab, setSubTab] = useState<"purchases" | "transfers">("purchases");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({ quantity: 0, unitCost: 0, totalCost: 0 });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const isRangeActive = !!(filterFrom || filterTo);

  // A date range is a real Firestore query (fetchPurchasesInRange), not a
  // filter over purchaseTransactions — that array only holds the recent
  // paginated window, so filtering it client-side would silently miss any
  // older history the range asks for.
  const [rangeResults, setRangeResults] = useState<Purchase[] | null>(null);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState(false);

  // Reset synchronously when the range changes (React's documented "adjust
  // state during render" pattern, same as useSalesData's branch-switch reset)
  // so stale results never flash under a new From/To before the fetch below resolves.
  const filterKey = `${filterFrom}|${filterTo}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setRangeResults(null);
    setRangeTruncated(false);
    setRangeError(false);
    setRangeLoading(isRangeActive);
  }

  useEffect(() => {
    if (!isRangeActive) return;
    let cancelled = false;
    fetchPurchasesInRange(filterFrom, filterTo)
      .then(({ purchases, truncated }) => {
        if (cancelled) return;
        setRangeResults(purchases);
        setRangeTruncated(truncated);
        setRangeError(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Purchases range query error:", error);
        setRangeError(true);
      })
      .finally(() => { if (!cancelled) setRangeLoading(false); });
    return () => { cancelled = true; };
    // purchasesVersion isn't read in the body — it's a refetch trigger so an
    // edit/delete made while a range filter is active doesn't leave stale results on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo, fetchPurchasesInRange, purchasesVersion]);

  // Never fall back to the unfiltered recent window while a range is active —
  // that would silently show the wrong data on a query error.
  const filtered = useMemo(
    () => (isRangeActive ? (rangeResults ?? []) : purchaseTransactions),
    [isRangeActive, rangeResults, purchaseTransactions],
  );

  // Real purchases only — transfers move existing stock, they don't add to
  // how much was actually bought/spent.
  // A purchaseDelivery stands on its own: it records what was paid, and deleting
  // its product lines only adjusts inventory. So the scope is by DATE, not by the
  // ids the visible lines happen to reference — otherwise a delivery whose lines
  // were all deleted would keep counting in the Income Statement while vanishing
  // from this table and its footer.
  //
  // With a range filter, that range is the scope. Without one, `filtered` is just
  // the paginated recent window, so the scope is the date span it covers — a
  // delivery older than everything on screen belongs to a page not yet loaded.
  const visibleDeliveries = useMemo(() => {
    if (isRangeActive) {
      return purchaseDeliveries.filter((d) =>
        (!filterFrom || d.date >= filterFrom) && (!filterTo || d.date <= filterTo));
    }
    if (filtered.length === 0) return [];
    const dates = filtered.map((t) => t.date);
    const earliest = dates.reduce((a, b) => (a < b ? a : b));
    return purchaseDeliveries.filter((d) => d.date >= earliest);
  }, [purchaseDeliveries, isRangeActive, filterFrom, filterTo, filtered]);

  // purchaseCost() rather than a local sum, so this footer can never disagree
  // with the Income Statement.
  const totalCost = purchaseCost(filtered, visibleDeliveries).total;
  const totalItems = filtered.filter((t) => !t.isTransfer).reduce((sum, t) => sum + (t.quantity || 0), 0);
  // A range query is always complete, so "Total" is accurate there. With no
  // filter, purchaseTransactions is just the paginated recent window — flag
  // that explicitly rather than let the total read as "all-time".
  const totalLabel = !isRangeActive && hasMorePurchases ? "Total (recent)" : "Total";

  // Merge each transfer's source/destination doc pair into a single row.
  const rows = useMemo(() => {
    const branchName = (id: string) => branches.find((b) => b.id === id)?.name || id;
    // Legacy fallback label for a transfer doc with no transferGroupId (shouldn't
    // occur going forward — every new transfer gets one).
    const legacyTransferLabel = (t: Purchase): string => {
      const other = t.transferBranch ? branchName(t.transferBranch) : "";
      return (t.quantity || 0) < 0 ? `Transfer → ${other}` : `Transfer ← ${other}`;
    };

    const result: DisplayRow[] = [];
    const transferGroups = new Map<string, Purchase[]>();
    const ungroupedTransfers: Purchase[] = [];

    for (const t of filtered) {
      if (!t.isTransfer) {
        result.push({
          key: t.id,
          date: t.date,
          createdAtSeconds: t.createdAt?.seconds || 0,
          product: t.product,
          isTransfer: false,
          quantity: t.quantity,
          unitCost: t.unitCost,
          // Not `|| 0`: absent must stay absent so the cost column can show "—"
          // instead of a zero that reads as free stock.
          totalCost: t.totalCost,
          deliveryId: t.deliveryId,
          purchase: t,
        });
        continue;
      }
      if (t.transferGroupId) {
        const group = transferGroups.get(t.transferGroupId) || [];
        group.push(t);
        transferGroups.set(t.transferGroupId, group);
      } else {
        ungroupedTransfers.push(t);
      }
    }

    transferGroups.forEach((group, groupId) => {
      const positive = group.find((g) => (g.quantity || 0) > 0);
      const negative = group.find((g) => (g.quantity || 0) < 0);
      // Both sides of the pair commit in one batch (see recordTransfer), but
      // a range/window boundary can still load only one of them — wait for
      // the other rather than mislabel the route off a single side.
      if (!positive || !negative) return;
      const fromId = negative.branch || positive.transferBranch || "";
      const toId = positive.branch || "";
      result.push({
        key: groupId,
        date: positive.date,
        createdAtSeconds: positive.createdAt?.seconds || 0,
        product: positive.product,
        transferLabel: `Transfer: ${branchName(fromId)} → ${branchName(toId)}`,
        isTransfer: true,
        quantity: Math.abs(positive.quantity || 0),
        unitCost: 0,
        totalCost: 0,
        transferGroupId: groupId,
      });
    });

    ungroupedTransfers.forEach((t) => {
      result.push({
        key: t.id,
        date: t.date,
        createdAtSeconds: t.createdAt?.seconds || 0,
        product: t.product,
        transferLabel: legacyTransferLabel(t),
        isTransfer: true,
        quantity: t.quantity,
        unitCost: 0,
        totalCost: 0,
        purchase: t,
      });
    });

    return result;
  }, [filtered, branches]);

  // Purchases and Transfers are shown in separate subtabs — split once here.
  const purchaseRows = useMemo(() => rows.filter((r) => !r.isTransfer), [rows]);
  const transferRows = useMemo(() => rows.filter((r) => r.isTransfer), [rows]);

  // Date column is sortable (click the header to toggle); everything else
  // stays in whatever order it was built in above.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleDateSort = () => setSortDir((d) => (d === "desc" ? "asc" : "desc"));

  const activeRows = useMemo(() => {
    const base = subTab === "purchases" ? purchaseRows : transferRows;
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...base].sort((a, b) => {
      if (a.date !== b.date) return dir * a.date.localeCompare(b.date);
      return dir * (a.createdAtSeconds - b.createdAtSeconds);
    });

    // Grouped into display items: a delivery becomes a header carrying the cost
    // followed by its product lines; a pre-delivery row stands alone with its own
    // line cost. Grouping is explicit (by deliveryId) rather than relying on the
    // sort leaving a delivery's lines adjacent — every line of one delivery
    // shares a createdAt to the second, so two deliveries in the same second
    // would otherwise interleave.
    const byId = new Map(visibleDeliveries.map((d) => [d.id, d]));
    const items: DisplayItem[] = [];
    const emitted = new Set<string>();

    const pushDelivery = (deliveryId: string, fallbackDate: string) => {
      emitted.add(deliveryId);
      const lines = sorted.filter((r) => r.deliveryId === deliveryId);
      items.push({
        kind: "deliveryHeader",
        key: `d-${deliveryId}`,
        date: byId.get(deliveryId)?.date || fallbackDate,
        // undefined (not 0) when the doc isn't loaded — "—" is honest, a zero
        // would read as a free delivery.
        totalCost: byId.get(deliveryId)?.totalCost,
        costPending: byId.get(deliveryId)?.costPending,
        lineCount: lines.length,
        itemCount: lines.reduce((s, r) => s + (r.quantity || 0), 0),
      });
      lines.forEach((r) => items.push({ kind: "row", row: r }));
    };

    for (const row of sorted) {
      if (!row.deliveryId) {
        items.push({ kind: "row", row: { ...row, deliveryCost: row.totalCost } });
        continue;
      }
      if (emitted.has(row.deliveryId)) continue;
      pushDelivery(row.deliveryId, row.date);
    }

    // Deliveries with no surviving lines still cost money, so they still get a
    // header — showing 0 items rather than disappearing. Appended, then the whole
    // list is re-sorted by date below so they land in the right place.
    // Purchases subtab only: a delivery is not a transfer.
    if (subTab === "purchases") {
      for (const d of visibleDeliveries) {
        if (!emitted.has(d.id)) pushDelivery(d.id, d.date);
      }
    }

    const itemDate = (i: DisplayItem) => (i.kind === "deliveryHeader" ? i.date : i.row.date);
    // Stable: a delivery header and its children share a date, and sort() keeps
    // their relative order, so children stay under their own header.
    return [...items].sort((a, b) => dir * itemDate(a).localeCompare(itemDate(b)));
  }, [subTab, purchaseRows, transferRows, sortDir, visibleDeliveries]);

  const totalTransferItems = transferRows.reduce((sum, r) => sum + (r.quantity || 0), 0);

  const startEdit = (row: DisplayRow) => {
    if (!row.purchase) return;
    setEditingId(row.key);
    setEditData({
      quantity: row.purchase.quantity || 0,
      unitCost: row.purchase.unitCost || 0,
      totalCost: row.purchase.totalCost || 0,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    onUpdatePurchase(editingId, editData);
    setEditingId(null);
    setEditData({ quantity: 0, unitCost: 0, totalCost: 0 });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ quantity: 0, unitCost: 0, totalCost: 0 });
  };

  const requestDelete = (row: DisplayRow) => {
    const { transferGroupId, purchase } = row;
    if (transferGroupId) {
      setPendingDelete({
        message: `Delete this transfer of ${row.quantity}x ${row.product} (${row.transferLabel})? This cannot be undone.`,
        onConfirm: () => onDeleteTransfer(transferGroupId),
      });
    } else if (purchase) {
      setPendingDelete({
        message: `Delete purchase of ${row.quantity}x ${row.product} (${fmt(row.totalCost || 0)})? This cannot be undone.`,
        onConfirm: () => onDeletePurchase(purchase.id),
      });
    }
  };

  return (
    <div className="animate-fade">
      {/* Sub-tabs */}
      <div className={styles.subTabs}>
        {subTabs.map((tab) => {
          const isActive = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`${styles.subTab} ${isActive ? styles.subTabActive : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className={styles.card}>
        {/* Header with filters + Add button */}
        <div className={styles.toolbar}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className={styles.dateInput}
            />
          </div>
          <button
            className={styles.presetButton}
            onClick={() => { const r = presetThisMonth(today()); setFilterFrom(r.start); setFilterTo(r.end); }}
          >
            This Month
          </button>
          <button
            className={styles.presetButton}
            onClick={() => { const r = presetLastMonth(today()); setFilterFrom(r.start); setFilterTo(r.end); }}
          >
            Last Month
          </button>
          {(filterFrom || filterTo) && (
            <button
              onClick={() => { setFilterFrom(""); setFilterTo(""); }}
              className={styles.clearButton}
            >
              Clear
            </button>
          )}
          {subTab === "purchases" && (
            <button
              onClick={onOpenPurchaseModal}
              className={styles.addButton}
            >
              <PlusIcon /> Add Purchase
            </button>
          )}
        </div>

        {/* Purchases / Transfers list */}
        <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
        <table className={styles.table}>
          <colgroup>
            {subTab === "purchases" ? (
              <>
                <col style={{ width: "14%" }} />
                <col style={{ width: "34%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "8%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "14%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "28%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              <th
                className={styles.sortableHeader}
                onClick={toggleDateSort}
                title="Sort by date"
              >
                Date {sortDir === "desc" ? "▼" : "▲"}
              </th>
              <th>Product</th>
              {subTab === "purchases" ? (
                <>
                  <th className={styles.alignCenter}>Qty</th>
                  {/* Cost sits on the delivery header row above its products.
                      This column only carries a figure for pre-delivery docs,
                      which were costed per line (most of July). */}
                  <th className={styles.alignRight}>Cost</th>
                  <th className={styles.alignCenter}>Actions</th>
                </>
              ) : (
                <>
                  <th>Route</th>
                  <th className={styles.alignCenter}>Qty</th>
                  <th className={styles.alignCenter}>Actions</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {activeRows.length > 0 ? (
              activeRows.map((item) => (
                /* A delivery header spans the table and carries the one cost
                   figure for that delivery; its product rows below show quantity
                   only, so the cost can never read as a per-product price. */
                item.kind === "deliveryHeader" ? (
                  <tr key={item.key} className={styles.deliveryHeaderRow}>
                    <td className={styles.deliveryHeaderDate}>{formatDateShort(item.date)}</td>
                    <td colSpan={2} className={styles.deliveryHeaderLabel}>
                      Delivery
                      <span className={styles.deliveryHeaderMeta}>
                        {item.itemCount} item{item.itemCount !== 1 ? "s" : ""} · {item.lineCount} product{item.lineCount !== 1 ? "s" : ""}
                      </span>
                    </td>
                    {/* Three distinct states, and collapsing any two of them
                        would misreport money: a real total, a delivery nobody
                        has costed yet (placeholder 0 — must not render as
                        ₱0.00), and a doc that simply isn't loaded. */}
                    <td className={`${styles.deliveryHeaderCost} ${item.costPending ? styles.deliveryHeaderCostPending : ""}`}>
                      {item.costPending
                        ? "Not yet costed"
                        : item.totalCost == null ? "—" : fmt(item.totalCost)}
                    </td>
                    <td />
                  </tr>
                ) : (() => {
                const row = item.row;
                return (
                editingId === row.key ? (
                  <tr key={row.key}>
                    <td colSpan={5} className={styles.editCell}>
                      <div className={styles.editFields}>
                        <div className={styles.editFieldProduct}>
                          <span className={styles.editFieldLabel}>Product</span>
                          <div className={styles.editProductName}>
                            {row.product}
                          </div>
                        </div>
                        <div className={styles.editFieldShort}>
                          <span className={styles.editFieldLabel}>Qty</span>
                          <input type="number" value={editData.quantity} onChange={(e) => {
                            const qty = parseInt(e.target.value) || 0;
                            setEditData((p) => ({ ...p, quantity: qty, totalCost: qty * (p.unitCost || 0) }));
                          }} className={styles.editInput} />
                        </div>
                        {/* Cost fields only for pre-delivery docs. A delivery
                            line has no cost of its own — writing one here would
                            be ignored by purchaseCost() and read as a real
                            per-product price by anyone looking at the doc. */}
                        {!row.deliveryId && (
                          <>
                            <div className={styles.editFieldMed}>
                              <span className={styles.editFieldLabel}>Unit Cost</span>
                              <input type="number" value={editData.unitCost} onChange={(e) => {
                                const uc = parseFloat(e.target.value) || 0;
                                setEditData((p) => ({ ...p, unitCost: uc, totalCost: (p.quantity || 0) * uc }));
                              }} className={styles.editInput} />
                            </div>
                            <div className={styles.editFieldMed}>
                              <span className={styles.editFieldLabel}>Total</span>
                              <div className={styles.editTotalValue}>
                                {fmt(editData.totalCost)}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className={styles.editActions}>
                        <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                        <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                      </div>
                    </td>
                  </tr>
                ) : subTab === "purchases" ? (
                  <tr key={row.key}>
                    {/* A delivery's date is on its header row; repeating it on
                        every child line just adds noise. */}
                    <td className={styles.dateCell}>
                      {row.deliveryId ? "" : formatDateShort(row.date)}
                    </td>
                    <td className={`${styles.productName} ${row.deliveryId ? styles.deliveryChildProduct : ""}`}>
                      {row.product}
                    </td>
                    <td className={styles.qtyCell}>{row.quantity}</td>
                    <td className={styles.totalCostCell}>
                      {row.deliveryCost == null ? "—" : fmt(row.deliveryCost)}
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button onClick={() => startEdit(row)} className={styles.iconButton} title="Edit">
                          <EditIcon />
                        </button>
                        <button onClick={() => requestDelete(row)} className={styles.iconButton} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.key}>
                    <td className={styles.dateCell}>{formatDateShort(row.date)}</td>
                    <td className={styles.productName}>{row.product}</td>
                    <td className={styles.routeCell}>{row.transferLabel}</td>
                    <td className={styles.qtyCell}>{row.quantity}</td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button onClick={() => requestDelete(row)} className={styles.iconButton} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
                );
                })()
              ))
            ) : (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  {rangeError
                    ? "Couldn't load purchases for this range. Please try again."
                    : rangeLoading
                    ? "Searching…"
                    : isRangeActive
                    ? `No ${subTab === "purchases" ? "purchases" : "transfers"} in the selected date range.`
                    : `No ${subTab === "purchases" ? "purchases" : "transfers"} recorded yet.`}
                </td>
              </tr>
            )}
          </tbody>
          {activeRows.length > 0 && (
            <tfoot>
              {subTab === "purchases" ? (
                <tr>
                  <td colSpan={2} className={styles.grandTotalLabel}>{totalLabel}</td>
                  <td className={styles.grandTotalQty}>{totalItems}</td>
                  <td className={styles.grandTotalCost}>{fmt(totalCost)}</td>
                  <td />
                </tr>
              ) : (
                <tr>
                  <td colSpan={2} className={styles.grandTotalLabel}>{totalLabel}</td>
                  <td />
                  <td className={styles.grandTotalQty}>{totalTransferItems}</td>
                  <td />
                </tr>
              )}
            </tfoot>
          )}
        </table>
        </div>
        </div>

        {/* A date range is already a complete query — pagination only applies to the unfiltered recent view. */}
        {!isRangeActive && hasMorePurchases && (
          <div className={styles.loadMoreRow}>
            <button
              onClick={onLoadMorePurchases}
              disabled={loadingMorePurchases}
              className={styles.loadMoreButton}
            >
              {loadingMorePurchases ? "Loading…" : "Load older purchases"}
            </button>
          </div>
        )}
        {isRangeActive && rangeTruncated && (
          <div className={styles.rangeTruncatedNote}>
            Showing the first 500 matches — narrow the date range to see everything.
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Delete Entry"
          message={pendingDelete.message}
          confirmLabel="Delete"
          onConfirm={() => { pendingDelete.onConfirm(); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
