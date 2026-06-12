import { useState, useMemo } from "react";
import { fmt } from "../../lib/utils";
import { EditIcon, TrashIcon } from "../../components/Icons";
import ConfirmModal from "../../components/ConfirmModal";
import type { Refund } from "../../lib/types";
import type { UpdateRefundFn, RefundItemInput } from "./transactionsTypes";
import styles from "./RefundsPage.module.css";

// Mutable item shape during inline edit (qty/value may be strings while typing).
type EditItem = Record<string, unknown>;
interface RefundEditData {
  invoice: string;
  customerName: string;
  reason: string;
  totalRefund: number;
  items: EditItem[];
}

interface RefundsPageProps {
  allRefunds: Refund[];
  onUpdateRefund: UpdateRefundFn;
  onDeleteRefund: (id: string) => Promise<void>;
}

export default function RefundsPage({ allRefunds, onUpdateRefund, onDeleteRefund }: RefundsPageProps) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [defectiveOnly, setDefectiveOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<RefundEditData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Refund | null>(null);

  // Filter by date range + defective, sort most recent first
  const filtered = useMemo(() => {
    let list = [...allRefunds];
    if (filterFrom) list = list.filter((r) => r.date >= filterFrom);
    if (filterTo) list = list.filter((r) => r.date <= filterTo);
    if (defectiveOnly) list = list.filter((r) => (r.items || []).some((item) => item.defective));
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return tB - tA;
    });
    return list;
  }, [allRefunds, filterFrom, filterTo, defectiveOnly]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { date: string; items: Refund[] }[] = [];
    let currentDate: string | null = null;
    for (const r of filtered) {
      if (r.date !== currentDate) {
        currentDate = r.date;
        groups.push({ date: r.date, items: [] });
      }
      groups[groups.length - 1].items.push(r);
    }
    return groups;
  }, [filtered]);

  const startEdit = (r: Refund) => {
    setEditingId(r.id);
    setEditData({
      invoice: r.invoice || "",
      customerName: r.customerName || "",
      reason: r.reason || "",
      totalRefund: r.totalRefund || 0,
      items: (r.items || []).map((item) => ({ ...item })),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const saveEdit = async () => {
    if (!editData) return;
    const totalRefund = editData.items.reduce((sum, item) => sum + (parseFloat(String(item.value)) || 0), 0);
    await onUpdateRefund(editingId as string, {
      invoice: editData.invoice,
      customerName: editData.customerName,
      reason: editData.reason,
      totalRefund,
      items: editData.items as unknown as RefundItemInput[],
    });
    setEditingId(null);
    setEditData(null);
  };

  const updateEditItem = (idx: number, field: string, value: unknown) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  };

  return (
    <div className="animate-fade">
      {/* Header with filters */}
      <div className={styles.filterBar}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>From</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className={styles.dateInput} />
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>To</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className={styles.dateInput} />
        </div>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={defectiveOnly}
            onChange={(e) => setDefectiveOnly(e.target.checked)}
            className={styles.defectiveCheckbox}
          />
          <span className={`${styles.checkboxText} ${defectiveOnly ? styles.checkboxTextActive : ""}`}>
            Defective Only
          </span>
        </label>
        {(filterFrom || filterTo) && (
          <button onClick={() => { setFilterFrom(""); setFilterTo(""); }} className={styles.clearButton}>
            Clear
          </button>
        )}
      </div>

      {/* Grouped by date */}
      {grouped.length > 0 ? grouped.map((group) => {
        const groupTotal = group.items.reduce((sum, r) => sum + (r.totalRefund || 0), 0);
        const dateObj = new Date(group.date + "T00:00:00");
        const dateLabel = dateObj.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });

        return (
          <div key={group.date} className={styles.group}>
            {/* Date header */}
            <div className={styles.groupHeader}>
              <span className={styles.groupDate}>{dateLabel}</span>
              <span className={styles.groupTotal}>-{fmt(groupTotal)}</span>
            </div>

            <div className={styles.card}>
              {/* Table header */}
              <div className={styles.tableHeader}>
                <span>Invoice</span>
                <span>Customer</span>
                <span>Items</span>
                <span>Defective</span>
                <span>Defect Status</span>
                <span>Reason</span>
                <span className={styles.alignRight}>Amount</span>
                <span />
              </div>

              {group.items.map((r) => {
                const isEditing = editingId === r.id;
                const hasDefective = (r.items || []).some((item) => item.defective);

                if (isEditing && editData) {
                  const editTotal = editData.items.reduce((sum, item) => sum + (parseFloat(String(item.value)) || 0), 0);
                  return (
                    <div key={r.id} className={styles.editRow}>
                      {/* Edit: top fields */}
                      <div className={styles.editTopFields}>
                        <div className={styles.editFieldShrink}>
                          <span className={styles.editFieldLabel}>Invoice</span>
                          <input
                            value={editData.invoice}
                            onChange={(e) => setEditData((p) => (p ? { ...p, invoice: e.target.value } : p))}
                            className={`${styles.editInput} ${styles.editInputInvoice}`}
                          />
                        </div>
                        <div className={styles.editFieldShrink}>
                          <span className={styles.editFieldLabel}>Customer</span>
                          <input
                            value={editData.customerName}
                            onChange={(e) => setEditData((p) => (p ? { ...p, customerName: e.target.value } : p))}
                            className={`${styles.editInput} ${styles.editInputCustomer}`}
                          />
                        </div>
                        <div className={styles.editFieldShrink}>
                          <span className={styles.editFieldLabel}>Reason</span>
                          <input
                            value={editData.reason}
                            onChange={(e) => setEditData((p) => (p ? { ...p, reason: e.target.value } : p))}
                            className={`${styles.editInput} ${styles.editInputReason}`}
                          />
                        </div>
                      </div>

                      {/* Edit: items */}
                      {editData.items.map((item, idx) => (
                        <div key={idx} className={styles.editItem}>
                          <span className={styles.editItemLabel}>
                            {String(item.qty)}&times; {String(item.product)}
                          </span>
                          <div className={styles.editItemValue}>
                            <span className={styles.pesoSign}>₱</span>
                            <input
                              type="number"
                              value={(item.value as string | number) || ""}
                              onChange={(e) => updateEditItem(idx, "value", e.target.value)}
                              className={`${styles.editInput} ${styles.editInputMono} ${styles.editInputValue}`}
                            />
                          </div>
                          <label className={styles.defectiveLabel}>
                            <input
                              type="checkbox"
                              checked={(item.defective as boolean) || false}
                              onChange={(e) => {
                                updateEditItem(idx, "defective", e.target.checked);
                                if (e.target.checked && !item.defectStatus) {
                                  updateEditItem(idx, "defectStatus", "Pending");
                                }
                                if (!e.target.checked) {
                                  updateEditItem(idx, "defectStatus", "");
                                }
                              }}
                              className={styles.defectiveCheckboxSmall}
                            />
                            <span className={`${styles.defectiveText} ${item.defective ? styles.defectiveTextOn : ""}`}>
                              Defective
                            </span>
                          </label>
                          {item.defective ? (
                            <select
                              value={(item.defectStatus as string) || "Pending"}
                              onChange={(e) => updateEditItem(idx, "defectStatus", e.target.value)}
                              className={styles.defectStatusSelect}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Not Defective">Not Defective</option>
                              <option value="Defective & Replaced">Defective & Replaced</option>
                            </select>
                          ) : null}
                        </div>
                      ))}

                      {/* Edit: total + actions */}
                      <div className={styles.editFooter}>
                        <span className={styles.editTotal}>
                          Total: {fmt(editTotal)}
                        </span>
                        <div className={styles.editActions}>
                          <button onClick={cancelEdit} className={styles.cancelButton}>
                            Cancel
                          </button>
                          <button onClick={saveEdit} className={styles.saveButton}>
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                const defectStatus = (() => {
                  const statuses = (r.items || []).filter((item) => item.defective).map((item) => item.defectStatus || "Pending");
                  if (statuses.length === 0) return "";
                  const unique = [...new Set(statuses)];
                  return unique.length === 1 ? unique[0] : "Mixed";
                })();

                const statusClass =
                  defectStatus === "Pending" ? styles.statusPending
                  : defectStatus === "Defective & Replaced" ? styles.statusReplaced
                  : defectStatus === "Not Defective" ? styles.statusNotDefective
                  : styles.statusMixed;

                return (
                  <div key={r.id} className={styles.row}>
                    <span className={styles.cellStrong}>
                      {r.invoice || "—"}
                    </span>
                    <span className={styles.cellSecondary}>
                      {r.customerName || "—"}
                    </span>
                    <span className={styles.cellItems}>
                      {(r.items || []).map((item, i) => (
                        <span key={i}>
                          {i > 0 ? ", " : ""}{item.qty}&times; {item.product}
                        </span>
                      ))}
                    </span>
                    <span className={styles.cellDefective}>
                      {hasDefective ? (
                        <span className={styles.defectiveYes}>Yes</span>
                      ) : (
                        <span className={styles.defectiveNo}>No</span>
                      )}
                    </span>
                    <span className={styles.cellStatus}>
                      {defectStatus ? (
                        <span className={`${styles.statusBadge} ${statusClass}`}>
                          {defectStatus}
                        </span>
                      ) : (
                        <span className={styles.dim}>{"—"}</span>
                      )}
                    </span>
                    <span className={styles.cellReason}>
                      {r.reason || "—"}
                    </span>
                    <span className={styles.cellAmount}>
                      -{fmt(r.totalRefund || 0)}
                    </span>
                    <div className={styles.rowActions}>
                      <button onClick={() => startEdit(r)} className={styles.iconButton} title="Edit">
                        <EditIcon />
                      </button>
                      <button onClick={() => setPendingDelete(r)} className={styles.iconButton} title="Delete">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }) : (
        <div className={styles.empty}>
          No refunds recorded{filterFrom || filterTo ? " for the selected date range" : ""}.
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete Refund"
          message="Are you sure you want to delete this refund? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => { onDeleteRefund(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
