import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { PlusIcon, EditIcon, TrashIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import type { Purchase } from "../lib/types";
import styles from "./PurchasesPage.module.css";

interface EditData {
  quantity: number;
  unitCost: number;
  totalCost: number;
}

interface PurchasesPageProps {
  purchaseTransactions: Purchase[];
  onOpenPurchaseModal: () => void;
  onUpdatePurchase: (purchaseId: string, data: { quantity: number; unitCost: number; totalCost: number }) => Promise<void>;
  onDeletePurchase: (purchaseId: string) => Promise<void>;
}

export default function PurchasesPage({
  purchaseTransactions,
  onOpenPurchaseModal,
  onUpdatePurchase,
  onDeletePurchase,
}: PurchasesPageProps) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({ quantity: 0, unitCost: 0, totalCost: 0 });
  const [pendingDelete, setPendingDelete] = useState<Purchase | null>(null);

  // Filter by date range, then sort most recent first
  const filtered = useMemo(() => {
    let list = [...purchaseTransactions];
    if (filterFrom) list = list.filter((t) => t.date >= filterFrom);
    if (filterTo) list = list.filter((t) => t.date <= filterTo);
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return tB - tA;
    });
    return list;
  }, [purchaseTransactions, filterFrom, filterTo]);

  const totalCost = filtered.reduce((sum, t) => sum + (t.totalCost || 0), 0);
  const totalItems = filtered.reduce((sum, t) => sum + (t.quantity || 0), 0);

  // Group by date for section headers
  const grouped = useMemo(() => {
    const groups: { date: string; items: Purchase[] }[] = [];
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

  const startEdit = (t: Purchase) => {
    setEditingId(t.id);
    setEditData({
      quantity: t.quantity || 0,
      unitCost: t.unitCost || 0,
      totalCost: t.totalCost || 0,
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

  return (
    <div className="animate-fade">
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
        <button
          onClick={onOpenPurchaseModal}
          className={styles.addButton}
        >
          <PlusIcon /> Add Purchase
        </button>
      </div>

      {/* Purchases list */}
      <div className={styles.tableCard}>
        {/* Header */}
        <div className={styles.tableHeader}>
          <span>Product</span>
          <span className={styles.alignCenter}>Qty</span>
          <span className={styles.alignRight}>Unit Cost</span>
          <span className={styles.alignRight}>Total</span>
          <span className={styles.alignCenter}>Actions</span>
        </div>

        {filtered.length > 0 ? (
          <>
            {grouped.map((group) => {
              const dateObj = new Date(group.date + "T00:00:00");
              const dateLabel = dateObj.toLocaleDateString("en-PH", {
                weekday: "short", month: "short", day: "numeric", year: "numeric",
              });
              const groupTotal = group.items.reduce((sum, t) => sum + (t.totalCost || 0), 0);

              return (
                <React.Fragment key={group.date}>
                  {/* Date header */}
                  <div className={styles.dateHeader}>
                    <span>{dateLabel}</span>
                    <span className={styles.dateHeaderTotal}>
                      {fmt(groupTotal)}
                    </span>
                  </div>

                  {/* Rows */}
                  {group.items.map((t) => (
                    editingId === t.id ? (
                      <div key={t.id} className={styles.editRow}>
                        <div className={styles.editFields}>
                          <div className={styles.editFieldProduct}>
                            <span className={styles.editFieldLabel}>Product</span>
                            <div className={styles.editProductName}>
                              {t.product}
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
                    ) : (
                      <div key={t.id} className={styles.tableRow}>
                        <span className={styles.productName}>
                          {t.product}
                        </span>
                        <span className={styles.qtyCell}>
                          {t.quantity}
                        </span>
                        <span className={styles.unitCostCell}>
                          {fmt(t.unitCost || 0)}
                        </span>
                        <span className={styles.totalCostCell}>
                          {fmt(t.totalCost || 0)}
                        </span>
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
                </React.Fragment>
              );
            })}

            {/* Grand total */}
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
          </>
        ) : (
          <div className={styles.emptyState}>
            {purchaseTransactions.length > 0 ? "No purchases match the selected date range." : "No purchases recorded yet."}
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Delete Purchase"
          message={`Delete purchase of ${pendingDelete.quantity}x ${pendingDelete.product} (${fmt(pendingDelete.totalCost || 0)})? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeletePurchase(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
