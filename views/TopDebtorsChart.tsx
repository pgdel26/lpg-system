import { useMemo } from "react";
import { fmt } from "../lib/utils";
import { paymentSplit } from "../lib/payments";
import { customerKey } from "../lib/hooks/useCustomersData";
import type { SaleTransaction } from "../lib/types";
import styles from "./TopDebtorsChart.module.css";

interface TopDebtorsChartProps {
  arTransactions: SaleTransaction[];
}

export default function TopDebtorsChart({ arTransactions }: TopDebtorsChartProps) {
  const customerBalances = useMemo(() => {
    const byCustomer = new Map<string, { key: string; name: string; amount: number; count: number }>();
    for (const t of arTransactions) {
      if (t.arCollected) continue;
      // Grouped by name, not customerId — a stale/orphaned customerId on an
      // old sale doc must not split one person's balance into two rows (or
      // collide as a duplicate React key when it happens to match another
      // entry's display name). Same identity rule as useCustomersData's
      // dedup, so a customer can't be split here without also being
      // splittable at creation time.
      const key = customerKey(t.customerName || "Unknown");
      const entry = byCustomer.get(key) || { key, name: t.customerName || "Unknown", amount: 0, count: 0 };
      // The AR portion only — a partially-AR sale must not inflate a
      // customer's balance by the whole line total.
      entry.amount += paymentSplit(t).ar;
      entry.count += 1;
      byCustomer.set(key, entry);
    }
    return Array.from(byCustomer.values())
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [arTransactions]);

  if (customerBalances.length === 0) return null;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Total Balances (All Outlets)</div>
      <div className={styles.list}>
        {customerBalances.map((d) => (
          <div key={d.key} className={styles.listRow} title={`${d.count} pending invoice${d.count !== 1 ? "s" : ""}`}>
            <span className={styles.listLabel}>{d.name}</span>
            <span className={styles.listValue}>{fmt(d.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
