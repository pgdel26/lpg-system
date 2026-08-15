import React, { useMemo } from "react";
import { fmt } from "../lib/utils";
import { paymentSplit } from "../lib/payments";
import { customerKey } from "../lib/hooks/useCustomersData";
import { PlusIcon, PackageIcon } from "../components/Icons";
import type {
  SaleTransaction,
  Swap,
  Refund,
  Purchase,
  Pricebook,
  ProductMap,
  Staff,
  DailyReport,
  Expense,
} from "../lib/types";
import styles from "./DashboardPage.module.css";

// borderTop is data-driven (per-card color) — kept inline
const card = (color: string): React.CSSProperties => ({
  background: "var(--bg-card)",
  borderRadius: "14px",
  border: "1px solid var(--border)",
  padding: "20px",
  borderTop: `3px solid ${color}`,
});

interface DashboardPageProps {
  inventoryDate: string;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  purchaseTransactions: Purchase[];
  inventory?: unknown;
  activePricebook: Pricebook | null;
  products?: ProductMap;
  staff: Staff[];
  dailyReport: DailyReport | null;
  expenses: Expense[];
  arTransactions: SaleTransaction[];
  onViewInventory?: () => void;
  onNewSale?: () => void;
}

export default function DashboardPage({
  inventoryDate,
  saleTransactions,
  swaps,
  refunds,
  purchaseTransactions,
  activePricebook,
  staff,
  dailyReport,
  expenses,
  arTransactions,
  onViewInventory,
  onNewSale,
}: DashboardPageProps) {
  // ─── Today's sales / swaps / refunds ───
  const salesToday = useMemo(() => {
    const items = saleTransactions.filter((t) => t.date === inventoryDate);
    const totalRevenue = items.reduce((s, t) => s + (t.finalPrice || 0) * (t.quantity || 0), 0);
    const totalQty = items.reduce((s, t) => s + (t.quantity || 0), 0);
    return { totalRevenue, totalQty, txCount: items.length };
  }, [saleTransactions, inventoryDate]);

  const swapsToday = useMemo(() => {
    const items = swaps.filter((s) => s.date === inventoryDate);
    return { totalRevenue: items.reduce((s, t) => s + (t.price || 0), 0), count: items.length };
  }, [swaps, inventoryDate]);

  const refundsToday = useMemo(() => {
    const items = refunds.filter((r) => r.date === inventoryDate);
    return { totalRefunded: items.reduce((s, r) => s + (r.totalRefund || 0), 0), count: items.length };
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
    const nameFor = (id: string) => staffList.find((s) => s.id === id)?.name || null;
    const cashier = dailyReport?.cashier ? nameFor(dailyReport.cashier) : null;
    const crew = (dailyReport?.staff || []).map(nameFor).filter((n): n is string => Boolean(n));
    return { cashier, crew };
  }, [staff, dailyReport]);

  // ─── Pending A/R (all outstanding as of today) + biggest account ───
  // Uses paymentSplit().ar (not totalAmount) and customerKey() (not a raw
  // name compare) so this agrees with Receivables/TopDebtorsChart on both
  // the split-payment rule and the "same customer" identity rule — see
  // lib/payments.ts and lib/hooks/useCustomersData.ts.
  const arPending = useMemo(() => {
    const open = (arTransactions || []).filter((t) => !t.arCollected);
    let total = 0;
    const byAccount = new Map<string, { name: string; amount: number }>();
    for (const t of open) {
      const arAmount = paymentSplit(t).ar;
      total += arAmount;
      const key = customerKey(t.customerName || "Unknown");
      const entry = byAccount.get(key) || { name: t.customerName || "Unknown", amount: 0 };
      entry.amount += arAmount;
      byAccount.set(key, entry);
    }
    const biggest = Array.from(byAccount.values()).sort((a, b) => b.amount - a.amount)[0] || null;
    return { total, count: open.length, biggest };
  }, [arTransactions]);

  // ─── Recent activity (last 8 across sales / swaps / purchases) ───
  const recentActivity = useMemo(() => {
    const all = [
      ...saleTransactions.map((t) => ({
        type: "sale" as const,
        date: t.date,
        time: (t.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? new Date(t.date),
        desc: `${t.product} x${t.quantity}`,
        amount: (t.finalPrice || 0) * (t.quantity || 0),
        color: "#22c55e",
      })),
      ...swaps.map((s) => ({
        type: "swap" as const,
        date: s.date,
        time: (s.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? new Date(s.date),
        desc: `${s.productFrom} → ${s.productTo}`,
        amount: s.price || 0,
        color: "#f59e42",
      })),
      ...purchaseTransactions.map((p) => ({
        type: "purchase" as const,
        date: p.date,
        time: (p.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? new Date(p.date),
        desc: `${p.product} x${p.quantity}`,
        amount: -(p.totalCost || 0),
        color: "#3b82f6",
      })),
    ];
    all.sort((a, b) => b.time.getTime() - a.time.getTime());
    return all.slice(0, 8);
  }, [saleTransactions, swaps, purchaseTransactions]);

  const typeLabel: Record<string, string> = { sale: "Sale", swap: "Swap", purchase: "Purchase" };

  // breakdown chip for the net-sales hero
  const breakdownChip = (label: string, value: string, color: string) => (
    <div className={styles.chipCol}>
      <span className={styles.chipLabel}>{label}</span>
      {/* color is data-driven — kept inline */}
      <span className={styles.chipValue} style={{ color }}>{value}</span>
    </div>
  );

  return (
    <div>
      {/* ─── Quick Actions ─── */}
      <div className={styles.quickActions}>
        {onNewSale && (
          <button onClick={onNewSale} className={styles.addSaleButton}>
            <PlusIcon /> Add Sale
          </button>
        )}
        {onViewInventory && (
          <button onClick={onViewInventory} className={styles.viewInventoryButton}>
            <PackageIcon /> View Inventory
          </button>
        )}
      </div>

      {/* ─── Net Sales hero ─── */}
      {/* borderTop is data-driven — kept inline via card() */}
      <div style={{ ...card("#22c55e"), marginBottom: "16px" }}>
        <div className={styles.heroInner}>
          <div>
            <div className={styles.statLabel}>Net Sales Today</div>
            <div className={styles.heroAmount}>{fmt(netSales)}</div>
            <div className={styles.heroSub}>
              {salesToday.txCount} sale{salesToday.txCount !== 1 ? "s" : ""} &middot; {salesToday.totalQty} units &middot; Net of expenses: {fmt(netAfterExpenses)}
            </div>
          </div>
          <div className={styles.heroBreakdowns}>
            {breakdownChip("Gross Sales", fmt(salesToday.totalRevenue), "var(--text-secondary)")}
            {breakdownChip("Swaps", fmt(swapsToday.totalRevenue), "#f59e42")}
            {breakdownChip("− Refunds", fmt(refundsToday.totalRefunded), "#ef4444")}
          </div>
        </div>
      </div>

      {/* ─── Stat cards: Expenses / Pending A/R / Cashier & Staff ─── */}
      <div className={styles.statGrid}>
        {/* Total Expenses */}
        <div style={card("#f97316")}>
          <div className={styles.statLabel}>Total Expenses Today</div>
          <div className={styles.expensesValue}>{fmt(expensesToday.total)}</div>
          <div className={styles.statSub}>{expensesToday.count} expense{expensesToday.count !== 1 ? "s" : ""} recorded</div>
        </div>

        {/* Pending A/R */}
        <div style={card("#ef4444")}>
          <div className={styles.statLabel}>Pending A/R (as of today)</div>
          <div className={styles.arValue}>{fmt(arPending.total)}</div>
          {arPending.biggest ? (
            <div className={styles.statSub}>
              {arPending.count} open &middot; Biggest: {arPending.biggest.name} ({fmt(arPending.biggest.amount)})
            </div>
          ) : (
            <div className={styles.statSub}>No outstanding receivables</div>
          )}
        </div>

        {/* Cashier & Staff */}
        <div style={card("#6366f1")}>
          <div className={styles.statLabel}>Cashier &amp; Staff Today</div>
          <div className={styles.cashierName}>
            {dutyToday.cashier ? (
              <>
                {dutyToday.cashier}
                <span className={styles.cashierBadge}>CASHIER</span>
              </>
            ) : (
              <span className={styles.noCashier}>No cashier set</span>
            )}
          </div>
          {dutyToday.crew.length > 0 ? (
            <div className={styles.crewList}>
              {dutyToday.crew.map((name) => (
                <span key={name} className={styles.crewChip}>{name}</span>
              ))}
            </div>
          ) : (
            <div className={styles.statSub}>No staff assigned</div>
          )}
        </div>
      </div>

      {/* ─── Recent Activity ─── */}
      <div style={card("#3b82f6")}>
        <div className={styles.activitySectionLabel}>Recent Activity</div>
        {recentActivity.length === 0 ? (
          <div className={styles.activityEmpty}>No activity yet</div>
        ) : (
          <div className={styles.activityList}>
            {recentActivity.map((a, i) => (
              <div
                key={i}
                className={`${styles.activityRow}${i < recentActivity.length - 1 ? ` ${styles.activityRowBorder}` : ""}`}
              >
                <div className={styles.activityLeft}>
                  {/* bg/color are data-driven per activity type — kept inline */}
                  <span
                    className={styles.activityBadge}
                    style={{ background: `${a.color}20`, color: a.color }}
                  >
                    {typeLabel[a.type]}
                  </span>
                  <span className={styles.activityDesc}>{a.desc}</span>
                </div>
                <div className={styles.activityRight}>
                  {/* color is data-driven (positive = green, negative = red) — kept inline */}
                  <div
                    className={styles.activityAmount}
                    style={{ color: a.amount >= 0 ? "#22c55e" : "#ef4444" }}
                  >
                    {a.amount >= 0 ? "+" : ""}{fmt(a.amount)}
                  </div>
                  <div className={styles.activityDate}>{a.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Active Pricebook ─── */}
      {activePricebook && (
        <div style={{ marginTop: "16px", ...card("#8b5cf6") }}>
          <div className={styles.pricebookInner}>
            <div>
              <div className={styles.statLabel}>Active Pricebook</div>
              <div className={styles.pricebookName}>{activePricebook.name}</div>
            </div>
            <div className={styles.pricebookRight}>
              <div className={styles.pricebookEffectiveLabel}>Effective from</div>
              <div className={styles.pricebookEffectiveDate}>{activePricebook.effectiveDate}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
