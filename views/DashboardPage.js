import React, { useMemo } from "react";
import { fmt } from "../lib/utils";
import { PlusIcon, PackageIcon } from "../components/Icons";

// ─── shared styles ───
const card = (color) => ({
  background: "var(--bg-card)",
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
  staff,
  dailyReport,
  expenses,
  arTransactions,
  onNavigate,
  onNewSale,
}) {
  // ─── Today's sales / swaps / refunds ───
  const salesToday = useMemo(() => {
    const items = saleTransactions.filter((t) => t.date === inventoryDate);
    const totalRevenue = items.reduce((s, t) => s + (t.finalPrice || 0) * (t.qty || 0), 0);
    const totalQty = items.reduce((s, t) => s + (t.qty || 0), 0);
    return { totalRevenue, totalQty, txCount: items.length };
  }, [saleTransactions, inventoryDate]);

  const swapsToday = useMemo(() => {
    const items = swaps.filter((s) => s.date === inventoryDate);
    return { totalRevenue: items.reduce((s, t) => s + (t.price || 0), 0), count: items.length };
  }, [swaps, inventoryDate]);

  const refundsToday = useMemo(() => {
    const items = refunds.filter((r) => r.date === inventoryDate);
    return { totalRefunded: items.reduce((s, r) => s + (r.amount || 0), 0), count: items.length };
  }, [refunds, inventoryDate]);

  const netSales = salesToday.totalRevenue + swapsToday.totalRevenue - refundsToday.totalRefunded;

  // ─── Total expenses today (expenses prop is already filtered to inventoryDate) ───
  const expensesToday = useMemo(() => {
    const list = expenses || [];
    return { total: list.reduce((s, e) => s + (e.amount || 0), 0), count: list.length };
  }, [expenses]);

  const netAfterExpenses = netSales - expensesToday.total;

  // ─── Cashier & staff on duty today ───
  const dutyToday = useMemo(() => {
    const staffList = staff || [];
    const nameFor = (id) => staffList.find((s) => s.id === id)?.name || null;
    const cashier = dailyReport?.cashier ? nameFor(dailyReport.cashier) : null;
    const crew = (dailyReport?.staff || []).map(nameFor).filter(Boolean);
    return { cashier, crew };
  }, [staff, dailyReport]);

  // ─── Pending A/R (all outstanding as of today) + biggest account ───
  const arPending = useMemo(() => {
    const open = (arTransactions || []).filter((t) => !t.arCollected);
    const total = open.reduce((s, t) => s + (t.totalAmount || 0), 0);
    const byAccount = {};
    for (const t of open) {
      const name = t.customerName || "Unknown";
      byAccount[name] = (byAccount[name] || 0) + (t.totalAmount || 0);
    }
    const biggest = Object.entries(byAccount)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)[0] || null;
    return { total, count: open.length, biggest };
  }, [arTransactions]);

  // ─── Recent activity (last 8 across sales / swaps / purchases) ───
  const recentActivity = useMemo(() => {
    const all = [
      ...saleTransactions.map((t) => ({
        type: "sale", date: t.date,
        time: t.createdAt?.toDate?.() || new Date(t.date),
        desc: `${t.product} x${t.qty}`,
        amount: (t.finalPrice || 0) * (t.qty || 0), color: "#22c55e",
      })),
      ...swaps.map((s) => ({
        type: "swap", date: s.date,
        time: s.createdAt?.toDate?.() || new Date(s.date),
        desc: `${s.from} → ${s.to}`,
        amount: s.price || 0, color: "#f59e42",
      })),
      ...purchaseTransactions.map((p) => ({
        type: "purchase", date: p.date,
        time: p.createdAt?.toDate?.() || new Date(p.date),
        desc: `${p.product} x${p.qty}`,
        amount: -(p.totalCost || 0), color: "#3b82f6",
      })),
    ];
    all.sort((a, b) => b.time - a.time);
    return all.slice(0, 8);
  }, [saleTransactions, swaps, purchaseTransactions]);

  const typeLabel = { sale: "Sale", swap: "Swap", purchase: "Purchase" };

  // breakdown chip for the net-sales hero
  const breakdownChip = (label, value, color) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: "15px", fontWeight: 700, fontFamily: "var(--font-mono)", color }}>{value}</span>
    </div>
  );

  return (
    <div>
      {/* ─── Quick Actions ─── */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        {onNewSale && (
          <button
            onClick={onNewSale}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 18px", borderRadius: "10px", border: "none",
              cursor: "pointer", background: "var(--accent-blue)", color: "#fff",
              fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
            }}
          >
            <PlusIcon /> Add Sale
          </button>
        )}
        {onNavigate && (
          <button
            onClick={() => onNavigate("inventory")}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 18px", borderRadius: "10px", border: "none",
              cursor: "pointer", background: "rgba(37,99,235,0.1)", color: "var(--accent-blue)",
              fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
            }}
          >
            <PackageIcon /> View Inventory
          </button>
        )}
      </div>

      {/* ─── Net Sales hero ─── */}
      <div style={{ ...card("#22c55e"), marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={statLabel}>Net Sales Today</div>
            <div style={{ fontSize: "34px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "#16a34a", lineHeight: 1.1 }}>
              {fmt(netSales)}
            </div>
            <div style={statSub}>
              {salesToday.txCount} sale{salesToday.txCount !== 1 ? "s" : ""} &middot; {salesToday.totalQty} units &middot; Net of expenses: {fmt(netAfterExpenses)}
            </div>
          </div>
          <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
            {breakdownChip("Gross Sales", fmt(salesToday.totalRevenue), "var(--text-secondary)")}
            {breakdownChip("Swaps", fmt(swapsToday.totalRevenue), "#f59e42")}
            {breakdownChip("− Refunds", fmt(refundsToday.totalRefunded), "#ef4444")}
          </div>
        </div>
      </div>

      {/* ─── Stat cards: Expenses / Pending A/R / Cashier & Staff ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "16px" }}>
        {/* Total Expenses */}
        <div style={card("#f97316")}>
          <div style={statLabel}>Total Expenses Today</div>
          <div style={{ ...statValue, color: "#f97316" }}>{fmt(expensesToday.total)}</div>
          <div style={statSub}>{expensesToday.count} expense{expensesToday.count !== 1 ? "s" : ""} recorded</div>
        </div>

        {/* Pending A/R */}
        <div style={card("#ef4444")}>
          <div style={statLabel}>Pending A/R (as of today)</div>
          <div style={{ ...statValue, color: "#ef4444" }}>{fmt(arPending.total)}</div>
          {arPending.biggest ? (
            <div style={statSub}>
              {arPending.count} open &middot; Biggest: {arPending.biggest.name} ({fmt(arPending.biggest.amount)})
            </div>
          ) : (
            <div style={statSub}>No outstanding receivables</div>
          )}
        </div>

        {/* Cashier & Staff */}
        <div style={card("#6366f1")}>
          <div style={statLabel}>Cashier &amp; Staff Today</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
            {dutyToday.cashier || <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>No cashier set</span>}
            {dutyToday.cashier && <span style={{ fontSize: "10px", fontWeight: 600, color: "#6366f1", marginLeft: "6px" }}>CASHIER</span>}
          </div>
          {dutyToday.crew.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
              {dutyToday.crew.map((name) => (
                <span key={name} style={{
                  fontSize: "11px", fontWeight: 600, padding: "3px 9px", borderRadius: "999px",
                  background: "rgba(99,102,241,0.1)", color: "#6366f1",
                }}>
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <div style={statSub}>No staff assigned</div>
          )}
        </div>
      </div>

      {/* ─── Recent Activity ─── */}
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

      {/* ─── Active Pricebook ─── */}
      {activePricebook && (
        <div style={{ marginTop: "16px", ...card("#8b5cf6") }}>
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
