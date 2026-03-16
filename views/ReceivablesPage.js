import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { EditIcon, TrashIcon, XIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";

export default function ReceivablesPage({ arTransactions, onMarkCollected, onUpdateSale, onDeleteSale }) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending"); // "all", "pending", "collected"
  const [pendingCollect, setPendingCollect] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

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

  const totalPending = useMemo(() =>
    arTransactions.filter((t) => !t.arCollected).reduce((sum, t) => sum + (t.totalAmount || 0), 0),
    [arTransactions]
  );

  const totalCollected = useMemo(() =>
    arTransactions.filter((t) => t.arCollected).reduce((sum, t) => sum + (t.totalAmount || 0), 0),
    [arTransactions]
  );

  const filterInputStyle = {
    padding: "7px 10px", borderRadius: "8px",
    background: "#fff", border: "1px solid var(--border)",
    color: "var(--text-secondary)", fontSize: "12px", outline: "none",
    fontFamily: "inherit",
  };

  const editInputStyle = {
    padding: "4px 8px", borderRadius: "6px",
    background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
    color: "var(--text-secondary)", fontSize: "11px", outline: "none",
    fontFamily: "inherit", width: "100%",
  };

  const startEdit = (t) => {
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
    onUpdateSale(editingId, editData);
    setEditingId(null);
    setEditData({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  return (
    <div className="animate-fade">
      {/* Summary cards */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: "160px", padding: "16px 20px", borderRadius: "12px",
          background: "var(--bg-card)", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Total Pending
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-red)" }}>
            {fmt(totalPending)}
          </div>
        </div>
        <div style={{
          flex: 1, minWidth: "160px", padding: "16px 20px", borderRadius: "12px",
          background: "var(--bg-card)", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Total Collected
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-green)" }}>
            {fmt(totalCollected)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
          style={filterInputStyle} />
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>to</span>
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
          style={filterInputStyle} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...filterInputStyle, cursor: "pointer" }}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="collected">Collected</option>
        </select>
      </div>

      {/* AR list grouped by date */}
      {grouped.length > 0 ? grouped.map((group) => (
        <div key={group.date} style={{ marginBottom: "16px" }}>
          <div style={{
            fontSize: "11px", fontWeight: 700, color: "var(--text-dim)",
            textTransform: "uppercase", letterSpacing: "0.5px",
            marginBottom: "8px", paddingLeft: "2px",
          }}>
            {new Date(group.date + "T00:00:00").toLocaleDateString("en-PH", {
              weekday: "short", year: "numeric", month: "short", day: "numeric",
            })}
          </div>
          <div style={{
            background: "var(--bg-card)", borderRadius: "12px",
            border: "1px solid var(--border)", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 90px 60px",
              padding: "8px 14px", borderBottom: "1px solid var(--border)",
              fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
              textTransform: "uppercase", letterSpacing: "0.5px",
            }}>
              <span>Invoice</span>
              <span>Customer</span>
              <span>Product</span>
              <span style={{ textAlign: "right" }}>Amount</span>
              <span style={{ textAlign: "center" }}>Check</span>
              <span style={{ textAlign: "center" }}>Status</span>
              <span style={{ textAlign: "center" }}>Actions</span>
            </div>

            {group.items.map((t) => (
              editingId === t.id ? (
                <div key={t.id} style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(15,23,42,0.04)",
                  background: "rgba(59,130,246,0.04)",
                }}>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "100px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Invoice</span>
                      <input value={editData.invoice} onChange={(e) => setEditData((p) => ({ ...p, invoice: e.target.value }))}
                        style={{ ...editInputStyle, display: "block" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: "100px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Customer</span>
                      <input value={editData.customerName} onChange={(e) => setEditData((p) => ({ ...p, customerName: e.target.value }))}
                        style={{ ...editInputStyle, display: "block" }} />
                    </div>
                    <div style={{ minWidth: "80px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Discount</span>
                      <input type="number" value={editData.discount} onChange={(e) => {
                        const disc = parseFloat(e.target.value) || 0;
                        setEditData((p) => ({ ...p, discount: disc }));
                      }} style={{ ...editInputStyle, display: "block", fontFamily: "var(--font-mono)" }} />
                    </div>
                    <div style={{ minWidth: "100px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Total Amount</span>
                      <input type="number" value={editData.totalAmount} onChange={(e) => {
                        setEditData((p) => ({ ...p, totalAmount: parseFloat(e.target.value) || 0 }));
                      }} style={{ ...editInputStyle, display: "block", fontFamily: "var(--font-mono)" }} />
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
                  display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 90px 60px",
                  padding: "10px 14px", alignItems: "center",
                  borderBottom: "1px solid rgba(15,23,42,0.04)",
                  fontSize: "12px",
                }}>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                    {t.invoice || "\u2014"}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                    {t.customerName || "\u2014"}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                    {t.product || "\u2014"}
                    {t.quantity > 1 && <span style={{ color: "var(--text-dim)" }}> x{t.quantity}</span>}
                  </span>
                  <span style={{ textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    {fmt(t.totalAmount)}
                  </span>
                  <span style={{ textAlign: "center", fontSize: "10px", color: "var(--text-dim)" }}>
                    {t.checkDate ? (
                      <span title={`Check: ${fmt(t.checkAmount)} on ${t.checkDate}`}>
                        {t.checkDate}
                      </span>
                    ) : "\u2014"}
                  </span>
                  <div style={{ textAlign: "center" }}>
                    {t.arCollected ? (
                      <span style={{
                        fontSize: "10px", fontWeight: 700, color: "var(--accent-green)",
                        background: "rgba(34,197,94,0.1)", padding: "3px 8px",
                        borderRadius: "6px",
                      }}>
                        Collected
                      </span>
                    ) : (
                      <button
                        onClick={() => setPendingCollect(t)}
                        style={{
                          fontSize: "10px", fontWeight: 700, color: "var(--accent-blue)",
                          background: "rgba(59,130,246,0.1)", padding: "3px 8px",
                          borderRadius: "6px", border: "none", cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Mark Collected
                      </button>
                    )}
                  </div>
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
          </div>
        </div>
      )) : (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "13px", color: "var(--text-dim)" }}>
            No accounts receivable found.
          </div>
        </div>
      )}

      {pendingCollect && (
        <ConfirmModal
          title="Mark as Collected"
          message={`Mark ${fmt(pendingCollect.totalAmount)} from "${pendingCollect.customerName || "Unknown"}" (Invoice: ${pendingCollect.invoice || "N/A"}) as collected?`}
          confirmLabel="Collect"
          onConfirm={() => { onMarkCollected(pendingCollect.id); setPendingCollect(null); }}
          onCancel={() => setPendingCollect(null)}
        />
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
