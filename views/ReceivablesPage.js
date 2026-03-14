import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import ConfirmModal from "../components/ConfirmModal";

export default function ReceivablesPage({ arTransactions, onMarkCollected }) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending"); // "all", "pending", "collected"
  const [pendingCollect, setPendingCollect] = useState(null);

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
              display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 90px",
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
            </div>

            {group.items.map((t) => (
              <div key={t.id} style={{
                display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 90px",
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
              </div>
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
    </div>
  );
}
