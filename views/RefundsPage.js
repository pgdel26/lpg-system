import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { EditIcon, TrashIcon } from "../components/Icons";

export default function RefundsPage({ allRefunds, onUpdateRefund, onDeleteRefund }) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [defectiveOnly, setDefectiveOnly] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

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
    const groups = [];
    let currentDate = null;
    for (const r of filtered) {
      if (r.date !== currentDate) {
        currentDate = r.date;
        groups.push({ date: r.date, items: [] });
      }
      groups[groups.length - 1].items.push(r);
    }
    return groups;
  }, [filtered]);

  const startEdit = (r) => {
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
    const totalRefund = editData.items.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
    await onUpdateRefund(editingId, {
      invoice: editData.invoice,
      customerName: editData.customerName,
      reason: editData.reason,
      totalRefund,
      items: editData.items,
    });
    setEditingId(null);
    setEditData(null);
  };

  const updateEditItem = (idx, field, value) => {
    setEditData((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  };

  const fieldStyle = {
    padding: "8px 12px", borderRadius: "8px",
    background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
    color: "var(--text-secondary)", fontSize: "13px",
    fontFamily: "var(--font-mono)", outline: "none",
  };

  const editInputStyle = {
    padding: "4px 8px", borderRadius: "6px",
    background: "rgba(255,255,255,0.9)", border: "1px solid var(--border-light)",
    color: "var(--text-secondary)", fontSize: "11px", outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div className="animate-fade">
      {/* Header with filters */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>From</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} style={fieldStyle} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>To</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} style={fieldStyle} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={defectiveOnly}
            onChange={(e) => setDefectiveOnly(e.target.checked)}
            style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#ef4444" }}
          />
          <span style={{ fontSize: "12px", fontWeight: 600, color: defectiveOnly ? "#f87171" : "var(--text-muted)" }}>
            Defective Only
          </span>
        </label>
        {(filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterFrom(""); setFilterTo(""); }}
            style={{
              padding: "8px 14px", borderRadius: "8px", border: "none",
              cursor: "pointer", background: "rgba(239,68,68,0.1)",
              color: "#f87171", fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
            }}
          >
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
          <div key={group.date} style={{ marginBottom: "16px" }}>
            {/* Date header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: "6px", padding: "0 4px",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {dateLabel}
              </span>
              <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#f87171" }}>
                -{fmt(groupTotal)}
              </span>
            </div>

            <div style={{
              background: "var(--bg-card)", borderRadius: "12px",
              border: "1px solid var(--border)", overflow: "hidden",
            }}>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "0.8fr 1.2fr 2fr 0.7fr 1fr 0.8fr 0.8fr 56px",
                padding: "8px 14px", borderBottom: "1px solid var(--border)",
                fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                <span>Invoice</span>
                <span>Customer</span>
                <span>Items</span>
                <span>Defective</span>
                <span>Defect Status</span>
                <span>Reason</span>
                <span style={{ textAlign: "right" }}>Amount</span>
                <span />
              </div>

              {group.items.map((r) => {
                const isEditing = editingId === r.id;
                const hasDefective = (r.items || []).some((item) => item.defective);

                if (isEditing && editData) {
                  const editTotal = editData.items.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
                  return (
                    <div key={r.id} style={{
                      padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                      background: "rgba(59,130,246,0.03)",
                    }}>
                      {/* Edit: top fields */}
                      <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                        <div style={{ flex: "0 0 auto" }}>
                          <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Invoice</span>
                          <input
                            value={editData.invoice}
                            onChange={(e) => setEditData((p) => ({ ...p, invoice: e.target.value }))}
                            style={{ ...editInputStyle, width: "100px", display: "block" }}
                          />
                        </div>
                        <div style={{ flex: "0 0 auto" }}>
                          <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Customer</span>
                          <input
                            value={editData.customerName}
                            onChange={(e) => setEditData((p) => ({ ...p, customerName: e.target.value }))}
                            style={{ ...editInputStyle, width: "140px", display: "block" }}
                          />
                        </div>
                        <div style={{ flex: "0 0 auto" }}>
                          <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Reason</span>
                          <input
                            value={editData.reason}
                            onChange={(e) => setEditData((p) => ({ ...p, reason: e.target.value }))}
                            style={{ ...editInputStyle, width: "160px", display: "block" }}
                          />
                        </div>
                      </div>

                      {/* Edit: items */}
                      {editData.items.map((item, idx) => (
                        <div key={idx} style={{
                          display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px",
                          padding: "4px 8px", borderRadius: "6px", background: "rgba(241,245,249,0.6)",
                        }}>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, minWidth: "120px" }}>
                            {item.qty}&times; {item.product}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>₱</span>
                            <input
                              type="number"
                              value={item.value || ""}
                              onChange={(e) => updateEditItem(idx, "value", e.target.value)}
                              style={{ ...editInputStyle, width: "70px", fontFamily: "var(--font-mono)" }}
                            />
                          </div>
                          <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={item.defective || false}
                              onChange={(e) => {
                                updateEditItem(idx, "defective", e.target.checked);
                                if (e.target.checked && !item.defectStatus) {
                                  updateEditItem(idx, "defectStatus", "Pending");
                                }
                                if (!e.target.checked) {
                                  updateEditItem(idx, "defectStatus", "");
                                }
                              }}
                              style={{ width: "13px", height: "13px", cursor: "pointer", accentColor: "#ef4444" }}
                            />
                            <span style={{ fontSize: "10px", color: item.defective ? "#f87171" : "var(--text-dim)", fontWeight: 600 }}>
                              Defective
                            </span>
                          </label>
                          {item.defective && (
                            <select
                              value={item.defectStatus || "Pending"}
                              onChange={(e) => updateEditItem(idx, "defectStatus", e.target.value)}
                              style={{
                                padding: "3px 6px", borderRadius: "5px",
                                background: "rgba(255,255,255,0.9)", border: "1px solid var(--border-light)",
                                color: "var(--text-secondary)", fontSize: "10px", outline: "none",
                                fontFamily: "inherit", cursor: "pointer",
                              }}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Not Defective">Not Defective</option>
                              <option value="Defective & Replaced">Defective & Replaced</option>
                            </select>
                          )}
                        </div>
                      ))}

                      {/* Edit: total + actions */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#f87171" }}>
                          Total: {fmt(editTotal)}
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={cancelEdit}
                            style={{
                              padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                              background: "transparent", cursor: "pointer", fontSize: "11px",
                              color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveEdit}
                            style={{
                              padding: "4px 12px", borderRadius: "6px", border: "none",
                              background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                              color: "#fff", fontWeight: 600, fontFamily: "inherit",
                            }}
                          >
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

                return (
                  <div key={r.id} style={{
                    display: "grid", gridTemplateColumns: "0.8fr 1.2fr 2fr 0.7fr 1fr 0.8fr 0.8fr 56px",
                    padding: "10px 14px", alignItems: "center",
                    borderBottom: "1px solid rgba(15,23,42,0.04)",
                    fontSize: "12px",
                  }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                      {r.invoice || "\u2014"}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {r.customerName || "\u2014"}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                      {(r.items || []).map((item, i) => (
                        <span key={i}>
                          {i > 0 ? ", " : ""}{item.qty}&times; {item.product}
                        </span>
                      ))}
                    </span>
                    <span style={{ fontSize: "11px" }}>
                      {hasDefective ? (
                        <span style={{ color: "#f87171", fontWeight: 700 }}>Yes</span>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>No</span>
                      )}
                    </span>
                    <span style={{ fontSize: "10px" }}>
                      {defectStatus ? (
                        <span style={{
                          padding: "2px 8px", borderRadius: "4px", fontWeight: 700,
                          background: defectStatus === "Pending" ? "rgba(245,158,66,0.1)" : defectStatus === "Defective & Replaced" ? "rgba(34,197,94,0.1)" : defectStatus === "Not Defective" ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.1)",
                          color: defectStatus === "Pending" ? "var(--accent-orange)" : defectStatus === "Defective & Replaced" ? "var(--accent-green)" : defectStatus === "Not Defective" ? "var(--accent-blue)" : "var(--text-muted)",
                        }}>
                          {defectStatus}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>{"\u2014"}</span>
                      )}
                    </span>
                    <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>
                      {r.reason || "\u2014"}
                    </span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#f87171" }}>
                      -{fmt(r.totalRefund || 0)}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "2px", justifyContent: "center" }}>
                      <button
                        onClick={() => startEdit(r)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: "2px",
                          color: "var(--text-dim)", display: "flex", alignItems: "center",
                        }}
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        onClick={() => { if (confirm("Delete this refund?")) onDeleteRefund(r.id); }}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: "2px",
                          color: "var(--text-dim)", display: "flex", alignItems: "center",
                        }}
                        title="Delete"
                      >
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
        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", padding: "40px 20px",
          textAlign: "center", fontSize: "13px", color: "var(--text-dim)",
        }}>
          No refunds recorded{filterFrom || filterTo ? " for the selected date range" : ""}.
        </div>
      )}
    </div>
  );
}
