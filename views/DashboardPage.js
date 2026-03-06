import React, { useMemo } from "react";
import { fmt } from "../lib/utils";

// ─── helpers ───
const card = (color) => ({
  background: "var(--card-bg)",
  borderRadius: "14px",
  border: "1px solid var(--border)",
  padding: "20px",
  borderTop: `3px solid ${color}`,
});

const statLabel = { fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: "4px" };
const statValue = { fontSize: "24px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" };
const statSub = { fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" };

export default function DashboardPage({
  inventoryDate,
  saleTransactions,
  swaps,
  refunds,
  purchaseTransactions,
  inventory,
  activePricebook,
  products,
}) {
  // ─── Today's sales summary ───
  const salesToday = useMemo(() => {
    const items = saleTransactions.filter((t) => t.date === inventoryDate);
    const totalRevenue = items.reduce((s, t) => s + (t.finalPrice || 0) * (t.qty || 0), 0);
    const totalQty = items.reduce((s, t) => s + (t.qty || 0), 0);
    const txCount = items.length;
    return { items, totalRevenue, totalQty, txCount };
  }, [saleTransactions, inventoryDate]);

  // ─── Today's swaps ───
  const swapsToday = useMemo(() => {
    const items = swaps.filter((s) => s.date === inventoryDate);
    const totalRevenue = items.reduce((s, t) => s + (t.price || 0), 0);
    return { items, totalRevenue, count: items.length };
  }, [swaps, inventoryDate]);

  // ─── Today's refunds ───
  const refundsToday = useMemo(() => {
    const items = refunds.filter((r) => r.date === inventoryDate);
    const totalRefunded = items.reduce((s, r) => s + (r.amount || 0), 0);
    return { items, totalRefunded, count: items.length };
  }, [refunds, inventoryDate]);

  // ─── Today's purchases ───
  const purchasesToday = useMemo(() => {
    const items = purchaseTransactions.filter((p) => p.date === inventoryDate);
    const totalCost = items.reduce((s, p) => s + (p.totalCost || 0), 0);
    return { items, totalCost, count: items.length };
  }, [purchaseTransactions, inventoryDate]);

  // ─── Net revenue ───
  const netRevenue = salesToday.totalRevenue + swapsToday.totalRevenue - refundsToday.totalRefunded;

  // ─── Recent activity (last 10 across all types) ───
  const recentActivity = useMemo(() => {
    const all = [
      ...saleTransactions.map((t) => ({
        type: "sale",
        date: t.date,
        time: t.createdAt?.toDate?.() || new Date(t.date),
        desc: `${t.product} x${t.qty}`,
        amount: (t.finalPrice || 0) * (t.qty || 0),
        color: "#22c55e",
      })),
      ...swaps.map((s) => ({
        type: "swap",
        date: s.date,
        time: s.createdAt?.toDate?.() || new Date(s.date),
        desc: `${s.from} → ${s.to}`,
        amount: s.price || 0,
        color: "#f59e42",
      })),
      ...purchaseTransactions.map((p) => ({
        type: "purchase",
        date: p.date,
        time: p.createdAt?.toDate?.() || new Date(p.date),
        desc: `${p.product} x${p.qty}`,
        amount: -(p.totalCost || 0),
        color: "#3b82f6",
      })),
    ];
    all.sort((a, b) => b.time - a.time);
    return all.slice(0, 10);
  }, [saleTransactions, swaps, purchaseTransactions]);

  // ─── Top products today ───
  const topProducts = useMemo(() => {
    const map = {};
    saleTransactions
      .filter((t) => t.date === inventoryDate)
      .forEach((t) => {
        const key = t.product;
        if (!map[key]) map[key] = { product: key, qty: 0, revenue: 0 };
        map[key].qty += t.qty || 0;
        map[key].revenue += (t.finalPrice || 0) * (t.qty || 0);
      });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [saleTransactions, inventoryDate]);

  const typeLabel = { sale: "Sale", swap: "Swap", purchase: "Purchase" };

  return (
    <div>
      {/* ─── Summary Cards ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        {/* Total Sales */}
        <div style={card("#22c55e")}>
          <div style={statLabel}>Sales Today</div>
          <div style={{ ...statValue, color: "#22c55e" }}>{fmt(salesToday.totalRevenue)}</div>
          <div style={statSub}>{salesToday.txCount} transaction{salesToday.txCount !== 1 ? "s" : ""} &middot; {salesToday.totalQty} units</div>
        </div>

        {/* Swaps */}
        <div style={card("#f59e42")}>
          <div style={statLabel}>Swaps Today</div>
          <div style={{ ...statValue, color: "#f59e42" }}>{fmt(swapsToday.totalRevenue)}</div>
          <div style={statSub}>{swapsToday.count} swap{swapsToday.count !== 1 ? "s" : ""}</div>
        </div>

        {/* Refunds */}
        <div style={card("#ef4444")}>
          <div style={statLabel}>Refunds Today</div>
          <div style={{ ...statValue, color: "#ef4444" }}>{fmt(refundsToday.totalRefunded)}</div>
          <div style={statSub}>{refundsToday.count} refund{refundsToday.count !== 1 ? "s" : ""}</div>
        </div>

        {/* Net Revenue */}
        <div style={card("#3b82f6")}>
          <div style={statLabel}>Net Revenue</div>
          <div style={{ ...statValue, color: "#3b82f6" }}>{fmt(netRevenue)}</div>
          <div style={statSub}>Sales + Swaps − Refunds</div>
        </div>

        {/* Purchases */}
        <div style={card("#8b5cf6")}>
          <div style={statLabel}>Purchases Today</div>
          <div style={{ ...statValue, color: "#8b5cf6" }}>{fmt(purchasesToday.totalCost)}</div>
          <div style={statSub}>{purchasesToday.count} purchase{purchasesToday.count !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* ─── Two-column layout ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Top Products */}
        <div style={card("#f59e42")}>
          <div style={{ ...statLabel, marginBottom: "12px", fontSize: "12px" }}>Top Products Today</div>
          {topProducts.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "12px 0" }}>No sales recorded yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", fontSize: "10px", color: "var(--text-muted)", padding: "4px 0", fontWeight: 600 }}>Product</th>
                  <th style={{ textAlign: "right", fontSize: "10px", color: "var(--text-muted)", padding: "4px 0", fontWeight: 600 }}>Qty</th>
                  <th style={{ textAlign: "right", fontSize: "10px", color: "var(--text-muted)", padding: "4px 0", fontWeight: 600 }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.product} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ fontSize: "12px", padding: "8px 0", fontWeight: 500 }}>{p.product}</td>
                    <td style={{ fontSize: "12px", padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{p.qty}</td>
                    <td style={{ fontSize: "12px", padding: "8px 0", textAlign: "right", fontFamily: "var(--font-mono)", color: "#22c55e" }}>{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Activity */}
        <div style={card("#3b82f6")}>
          <div style={{ ...statLabel, marginBottom: "12px", fontSize: "12px" }}>Recent Activity</div>
          {recentActivity.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "12px 0" }}>No activity yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {recentActivity.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < recentActivity.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{
                      fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                      padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.5px",
                      background: `${a.color}20`, color: a.color,
                    }}>
                      {typeLabel[a.type]}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 500 }}>{a.desc}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: a.amount >= 0 ? "#22c55e" : "#ef4444" }}>
                      {a.amount >= 0 ? "+" : ""}{fmt(a.amount)}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{a.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Pricebook info */}
      {activePricebook && (
        <div style={{ marginTop: "16px", ...card("#6366f1") }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={statLabel}>Active Pricebook</div>
              <div style={{ fontSize: "16px", fontWeight: 700, marginTop: "4px" }}>{activePricebook.name}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Effective from</div>
              <div style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{activePricebook.effectiveDate}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
