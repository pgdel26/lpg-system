import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { PlusIcon, EditIcon, TrashIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import type { Purchase, Branch } from "../lib/types";
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
  unitCost: number;
  totalCost: number;
  /** Present for real purchases (and the legacy-fallback transfer case) — drives Edit/Delete. */
  purchase?: Purchase;
  /** Present for a properly-paired transfer — Delete removes both docs via this. */
  transferGroupId?: string;
}

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
  branches: Branch[];
  onOpenPurchaseModal: () => void;
  onUpdatePurchase: (purchaseId: string, data: { quantity: number; unitCost: number; totalCost: number }) => Promise<void>;
  onDeletePurchase: (purchaseId: string) => Promise<void>;
  onDeleteTransfer: (transferGroupId: string) => Promise<void>;
}

export default function PurchasesPage({
  purchaseTransactions,
  branches,
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

  // Filter by date range
  const filtered = useMemo(() => {
    let list = [...purchaseTransactions];
    if (filterFrom) list = list.filter((t) => t.date >= filterFrom);
    if (filterTo) list = list.filter((t) => t.date <= filterTo);
    return list;
  }, [purchaseTransactions, filterFrom, filterTo]);

  // Real purchases only — transfers move existing stock, they don't add to
  // how much was actually bought/spent.
  const totalCost = filtered.filter((t) => !t.isTransfer).reduce((sum, t) => sum + (t.totalCost || 0), 0);
  const totalItems = filtered.filter((t) => !t.isTransfer).reduce((sum, t) => sum + (t.quantity || 0), 0);

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
          unitCost: t.unitCost || 0,
          totalCost: t.totalCost || 0,
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
      const positive = group.find((g) => (g.quantity || 0) > 0) || group[0];
      const negative = group.find((g) => (g.quantity || 0) < 0);
      const fromId = negative?.branch || positive.transferBranch || "";
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

    result.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAtSeconds - a.createdAtSeconds;
    });
    return result;
  }, [filtered, branches]);

  // Purchases and Transfers are shown in separate subtabs — split once here.
  const purchaseRows = useMemo(() => rows.filter((r) => !r.isTransfer), [rows]);
  const transferRows = useMemo(() => rows.filter((r) => r.isTransfer), [rows]);
  const activeRows = subTab === "purchases" ? purchaseRows : transferRows;

  // Group by date for section headers
  const groupByDate = (list: DisplayRow[]) => {
    const groups: { date: string; items: DisplayRow[] }[] = [];
    let currentDate: string | null = null;
    for (const row of list) {
      if (row.date !== currentDate) {
        currentDate = row.date;
        groups.push({ date: row.date, items: [] });
      }
      groups[groups.length - 1].items.push(row);
    }
    return groups;
  };
  const grouped = useMemo(() => groupByDate(activeRows), [activeRows]);

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
        {/* Header */}
        {subTab === "purchases" ? (
          <div className={styles.tableHeader}>
            <span>Product</span>
            <span className={styles.alignCenter}>Qty</span>
            <span className={styles.alignRight}>Unit Cost</span>
            <span className={styles.alignRight}>Total</span>
            <span className={styles.alignCenter}>Actions</span>
          </div>
        ) : (
          <div className={styles.tableHeaderTransfers}>
            <span>Product</span>
            <span>Route</span>
            <span className={styles.alignCenter}>Qty</span>
            <span className={styles.alignCenter}>Actions</span>
          </div>
        )}

        {activeRows.length > 0 ? (
          <>
            {grouped.map((group) => {
              const dateObj = new Date(group.date + "T00:00:00");
              const dateLabel = dateObj.toLocaleDateString("en-PH", {
                weekday: "short", month: "short", day: "numeric", year: "numeric",
              });
              const groupTotal = group.items.reduce((sum, r) => sum + (r.totalCost || 0), 0);
              const groupQty = group.items.reduce((sum, r) => sum + (r.quantity || 0), 0);

              return (
                <React.Fragment key={group.date}>
                  {/* Date header */}
                  <div className={styles.dateHeader}>
                    <span>{dateLabel}</span>
                    <span className={styles.dateHeaderTotal}>
                      {subTab === "purchases" ? fmt(groupTotal) : `${groupQty} item${groupQty !== 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {/* Rows */}
                  {group.items.map((row) => (
                    editingId === row.key ? (
                      <div key={row.key} className={styles.editRow}>
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
                        </div>
                        <div className={styles.editActions}>
                          <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                          <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                        </div>
                      </div>
                    ) : subTab === "purchases" ? (
                      <div key={row.key} className={styles.tableRow}>
                        <span className={styles.productName}>
                          {row.product}
                        </span>
                        <span className={styles.qtyCell}>
                          {row.quantity}
                        </span>
                        <span className={styles.unitCostCell}>
                          {fmt(row.unitCost || 0)}
                        </span>
                        <span className={styles.totalCostCell}>
                          {fmt(row.totalCost || 0)}
                        </span>
                        <div className={styles.actionsCell}>
                          <button onClick={() => startEdit(row)} className={styles.iconButton} title="Edit">
                            <EditIcon />
                          </button>
                          <button onClick={() => requestDelete(row)} className={styles.iconButton} title="Delete">
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={row.key} className={styles.tableRowTransfers}>
                        <span className={styles.productName}>
                          {row.product}
                        </span>
                        <span className={styles.routeCell}>
                          {row.transferLabel}
                        </span>
                        <span className={styles.qtyCell}>
                          {row.quantity}
                        </span>
                        <div className={styles.actionsCell}>
                          <button onClick={() => requestDelete(row)} className={styles.iconButton} title="Delete">
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </React.Fragment>
              );
            })}

            {/* Grand total */}
            {subTab === "purchases" ? (
              <div className={styles.grandTotalRow}>
                <span className={styles.grandTotalLabel}>
                  Total
                </span>
                <span className={styles.grandTotalQty}>
                  {totalItems}
                </span>
                <span />
                <span className={styles.grandTotalCost}>
                  {fmt(totalCost)}
                </span>
                <span />
              </div>
            ) : (
              <div className={styles.grandTotalRowTransfers}>
                <span className={styles.grandTotalLabel}>
                  Total
                </span>
                <span />
                <span className={styles.grandTotalQty}>
                  {totalTransferItems}
                </span>
                <span />
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            {subTab === "purchases"
              ? (purchaseTransactions.some((t) => !t.isTransfer) ? "No purchases match the selected date range." : "No purchases recorded yet.")
              : (purchaseTransactions.some((t) => t.isTransfer) ? "No transfers match the selected date range." : "No transfers recorded yet.")}
          </div>
        )}
        </div>
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
