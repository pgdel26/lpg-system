import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { PlusIcon, EditIcon, TrashIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";

export default function PurchasesPage({
  purchaseTransactions,
  onOpenPurchaseModal,
  onUpdatePurchase,
  onDeletePurchase,
}) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);

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
    const groups = [];
    let currentDate = null;
    for (const t of filtered) {
      if (t.date !== currentDate) {
        currentDate = t.date;
        groups.push({ date: t.date, items: [] });
      }
      groups[groups.length - 1].items.push(t);
    }
    return groups;
  }, [filtered]);

  const fieldStyle = {
    padding: "8px 12px", borderRadius: "8px",
    background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
    color: "var(--text-secondary)", fontSize: "13px",
    fontFamily: "var(--font-mono)", outline: "none",
  };

  const editInputStyle = {
    padding: "4px 8px", borderRadius: "6px",
    background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
    color: "var(--text-secondary)", fontSize: "11px", outline: "none",
    fontFamily: "var(--font-mono)", width: "100%",
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditData({
      quantity: t.quantity || 0,
      unitCost: t.unitCost || 0,
      totalCost: t.totalCost || 0,
    });
  };

  const saveEdit = () => {
    onUpdatePurchase(editingId, editData);
    setEditingId(null);
    setEditData({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  return (
    <div className="animate-fade">
      {/* Header with filters + Add button */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>From</label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            style={fieldStyle}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>To</label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            style={fieldStyle}
          />
        </div>
        {(filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterFrom(""); setFilterTo(""); }}
            style={{
              padding: "8px 14px", borderRadius: "8px", border: "none",
              cursor: "pointer", background: "rgba(37,99,235,0.1)",
              color: "var(--accent-blue)", fontSize: "12px", fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        )}
        <button
          onClick={onOpenPurchaseModal}
          style={{
            marginLeft: "auto", padding: "8px 18px", borderRadius: "8px", border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            color: "#fff", fontSize: "12px", fontWeight: 700,
            fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          <PlusIcon /> Add Purchase
        </button>
      </div>

      {/* Purchases list */}
      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr 1fr 60px",
          padding: "10px 20px", borderBottom: "1px solid var(--border)",
          fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "1px",
        }}>
          <span>Product</span>
          <span style={{ textAlign: "center" }}>Qty</span>
          <span style={{ textAlign: "right" }}>Unit Cost</span>
          <span style={{ textAlign: "right" }}>Total</span>
          <span style={{ textAlign: "center" }}>Actions</span>
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
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 20px", fontSize: "11px", fontWeight: 700,
                    color: "var(--text-dim)", textTransform: "uppercase",
                    letterSpacing: "0.5px", background: "rgba(241,245,249,0.5)",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <span>{dateLabel}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      {fmt(groupTotal)}
                    </span>
                  </div>

                  {/* Rows */}
                  {group.items.map((t) => (
                    editingId === t.id ? (
                      <div key={t.id} style={{
                        padding: "10px 20px",
                        borderBottom: "1px solid rgba(15,23,42,0.04)",
                        background: "rgba(59,130,246,0.04)",
                      }}>
                        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "8px", flexWrap: "wrap" }}>
                          <div style={{ flex: 2, minWidth: "120px" }}>
                            <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Product</span>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", padding: "4px 0" }}>
                              {t.product}
                            </div>
                          </div>
                          <div style={{ minWidth: "70px" }}>
                            <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Qty</span>
                            <input type="number" value={editData.quantity} onChange={(e) => {
                              const qty = parseInt(e.target.value) || 0;
                              setEditData((p) => ({ ...p, quantity: qty, totalCost: qty * (p.unitCost || 0) }));
                            }} style={{ ...editInputStyle, display: "block" }} />
                          </div>
                          <div style={{ minWidth: "90px" }}>
                            <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Unit Cost</span>
                            <input type="number" value={editData.unitCost} onChange={(e) => {
                              const uc = parseFloat(e.target.value) || 0;
                              setEditData((p) => ({ ...p, unitCost: uc, totalCost: (p.quantity || 0) * uc }));
                            }} style={{ ...editInputStyle, display: "block" }} />
                          </div>
                          <div style={{ minWidth: "90px" }}>
                            <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Total</span>
                            <div style={{ fontSize: "13px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-blue)", padding: "4px 0" }}>
                              {fmt(editData.totalCost)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                          <button onClick={cancelEdit} style={{
                            padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                            background: "transparent", cursor: "pointer", fontSize: "11px",
                            color: "var(--text-muted)", fontFamily: "inherit",
                          }}>Cancel</button>
                          <button onClick={saveEdit} style={{
                            padding: "4px 12px", borderRadius: "6px", border: "none",
                            background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                            color: "#fff", fontWeight: 600, fontFamily: "inherit",
                          }}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div key={t.id} style={{
                        display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr 1fr 60px",
                        padding: "10px 20px", alignItems: "center",
                        borderBottom: "1px solid rgba(15,23,42,0.04)",
                      }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                          {t.product}
                        </span>
                        <span style={{ textAlign: "center", fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                          {t.quantity}
                        </span>
                        <span style={{ textAlign: "right", fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {fmt(t.unitCost || 0)}
                        </span>
                        <span style={{ textAlign: "right", fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-blue)" }}>
                          {fmt(t.totalCost || 0)}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "2px", justifyContent: "center" }}>
                          <button onClick={() => startEdit(t)} style={{
                            background: "none", border: "none", cursor: "pointer", padding: "2px",
                            color: "var(--text-dim)", display: "flex",
                          }} title="Edit">
                            <EditIcon />
                          </button>
                          <button onClick={() => setPendingDelete(t)} style={{
                            background: "none", border: "none", cursor: "pointer", padding: "2px",
                            color: "var(--text-dim)", display: "flex",
                          }} title="Delete">
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
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr 1fr 60px",
              padding: "10px 20px", borderTop: "1px solid var(--border)",
              background: "rgba(241,245,249,0.5)",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Total
              </span>
              <span style={{ textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                {totalItems}
              </span>
              <span />
              <span style={{ textAlign: "right", fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-blue)" }}>
                {fmt(totalCost)}
              </span>
              <span />
            </div>
          </>
        ) : (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
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
