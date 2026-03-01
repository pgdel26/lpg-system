import React from "react";
import { fmt, today } from "../lib/utils";

export default function TransactionsPage({
  inventoryDate, setInventoryDate,
  saleTransactions, swaps,
}) {
  const saleTypeLabel = (section) => {
    if (section === "cylinderWithRefill") return "Cyl+Refill";
    if (section === "refill") return "Refill";
    if (section === "accessories") return "Accessories";
    return section;
  };

  const sorted = [...saleTransactions].sort((a, b) => {
    const invA = (a.invoice || "").toLowerCase();
    const invB = (b.invoice || "").toLowerCase();
    if (invA !== invB) return invA.localeCompare(invB);
    const tA = a.createdAt?.seconds || 0;
    const tB = b.createdAt?.seconds || 0;
    return tA - tB;
  });

  const totalRevenue = sorted.reduce((sum, t) => sum + (t.finalPrice || 0), 0);
  const swapTotal = swaps.reduce((sum, s) => sum + (s.price || 0), 0);

  return (
    <div className="animate-fade">
      {/* Date selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          type="date"
          value={inventoryDate}
          onChange={(e) => setInventoryDate(e.target.value)}
          style={{
            padding: "8px 12px", borderRadius: "8px",
            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
            color: "var(--text-secondary)", fontSize: "13px",
            fontFamily: "var(--font-mono)", outline: "none",
          }}
        />
        {inventoryDate !== today() && (
          <button
            onClick={() => setInventoryDate(today())}
            style={{
              padding: "8px 14px", borderRadius: "8px", border: "none",
              cursor: "pointer", background: "rgba(37,99,235,0.1)",
              color: "var(--accent-blue)", fontSize: "12px", fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            Go to Today
          </button>
        )}
      </div>

      {/* Sales transactions table */}
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
          Sales
        </h3>
        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", overflow: "hidden",
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: "36px 1fr 1.2fr 1.2fr 0.8fr 0.8fr 0.7fr 0.8fr 0.7fr",
            padding: "8px 14px", borderBottom: "1px solid var(--border)",
            fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            <span>#</span>
            <span>Invoice</span>
            <span>Customer</span>
            <span>Product</span>
            <span>Type</span>
            <span style={{ textAlign: "right" }}>SRP</span>
            <span style={{ textAlign: "right" }}>Disc.</span>
            <span style={{ textAlign: "right" }}>Final</span>
            <span style={{ textAlign: "center" }}>Pay</span>
          </div>

          {sorted.length > 0 ? sorted.map((t, i) => (
            <div key={t.id} style={{
              display: "grid", gridTemplateColumns: "36px 1fr 1.2fr 1.2fr 0.8fr 0.8fr 0.7fr 0.8fr 0.7fr",
              padding: "8px 14px", alignItems: "center",
              borderBottom: "1px solid rgba(15,23,42,0.04)",
              fontSize: "12px",
            }}>
              <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>{i + 1}</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{t.invoice || "\u2014"}</span>
              <span style={{ color: "var(--text-secondary)" }}>{t.customerName || "\u2014"}</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{t.product}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>{saleTypeLabel(t.saleSection)}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "11px" }}>{fmt(t.srp || 0)}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: t.discount > 0 ? "var(--accent-red)" : "var(--text-dim)", fontSize: "11px" }}>
                {t.discount > 0 ? `-${fmt(t.discount)}` : "\u2014"}
              </span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)", fontSize: "12px" }}>
                {fmt(t.finalPrice || 0)}
              </span>
              <span style={{ textAlign: "center" }}>
                <span style={{
                  padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700,
                  background: t.paymentType === "cash" ? "rgba(34,197,94,0.1)" : "rgba(245,158,66,0.1)",
                  color: t.paymentType === "cash" ? "var(--accent-green)" : "var(--accent-orange)",
                }}>
                  {t.paymentType === "cash" ? "Cash" : "AR"}
                </span>
              </span>
            </div>
          )) : (
            <div style={{ padding: "20px 14px", textAlign: "center", fontSize: "12px", color: "var(--text-dim)" }}>
              No sales transactions recorded today.
            </div>
          )}

          {sorted.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "36px 1fr 1.2fr 1.2fr 0.8fr 0.8fr 0.7fr 0.8fr 0.7fr",
              padding: "10px 14px", borderTop: "1px solid var(--border)",
              background: "rgba(241,245,249,0.5)",
            }}>
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span style={{ textAlign: "right", fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>Total</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)", fontSize: "13px" }}>
                {fmt(totalRevenue)}
              </span>
              <span />
            </div>
          )}
        </div>
      </div>

      {/* Upgrade/Swap transactions */}
      {swaps.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
            Upgrade / Swap
          </h3>
          <div style={{
            background: "var(--bg-card)", borderRadius: "12px",
            border: "1px solid var(--border)", overflow: "hidden",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "36px 1.5fr 36px 1.5fr 1fr",
              padding: "8px 14px", borderBottom: "1px solid var(--border)",
              fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
              textTransform: "uppercase", letterSpacing: "0.5px",
            }}>
              <span>#</span>
              <span>From</span>
              <span />
              <span>To</span>
              <span style={{ textAlign: "right" }}>Price</span>
            </div>
            {swaps.map((s, i) => (
              <div key={s.id} style={{
                display: "grid", gridTemplateColumns: "36px 1.5fr 36px 1.5fr 1fr",
                padding: "8px 14px", alignItems: "center",
                borderBottom: "1px solid rgba(15,23,42,0.04)",
                fontSize: "12px",
              }}>
                <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>{i + 1}</span>
                <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{s.productFrom}</span>
                <span style={{ color: "var(--text-dim)", textAlign: "center" }}>&rarr;</span>
                <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{s.productTo}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)" }}>{fmt(s.price)}</span>
              </div>
            ))}
            <div style={{
              display: "grid", gridTemplateColumns: "36px 1.5fr 36px 1.5fr 1fr",
              padding: "10px 14px", borderTop: "1px solid var(--border)",
              background: "rgba(241,245,249,0.5)",
            }}>
              <span />
              <span />
              <span />
              <span style={{ textAlign: "right", fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>Total</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)", fontSize: "13px" }}>{fmt(swapTotal)}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
