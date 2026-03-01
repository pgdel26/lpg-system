import React, { useState, useMemo } from "react";
import { fmt } from "../lib/utils";
import { PlusIcon } from "../components/Icons";

export default function PurchasesPage({
  purchaseTransactions,
  onOpenPurchaseModal,
}) {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

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
          display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr 1fr",
          padding: "10px 20px", borderBottom: "1px solid var(--border)",
          fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "1px",
        }}>
          <span>Product</span>
          <span style={{ textAlign: "center" }}>Qty</span>
          <span style={{ textAlign: "right" }}>Unit Cost</span>
          <span style={{ textAlign: "right" }}>Total</span>
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
                    <div key={t.id} style={{
                      display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr 1fr",
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
                    </div>
                  ))}
                </React.Fragment>
              );
            })}

            {/* Grand total */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 0.8fr 1fr 1fr",
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
            </div>
          </>
        ) : (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
            {purchaseTransactions.length > 0 ? "No purchases match the selected date range." : "No purchases recorded yet."}
          </div>
        )}
      </div>
    </div>
  );
}
