import { useState } from "react";
import { fmt } from "../../lib/utils";
import type { IncomeStatementResult } from "../../lib/reports/incomeStatement";
import styles from "./DiscountsByCustomerCard.module.css";

const PAGE_SIZE = 30;

export default function DiscountsByCustomerCard({ result }: { result: IncomeStatementResult }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Resets the page size when the period/outlet changes (a new `result`
  // reference) — done during render, not in an effect, so a stale count from
  // the previous period never paints even for a frame.
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    setVisibleCount(PAGE_SIZE);
  }

  if (result.discountsByCustomer.length === 0) return null;

  const visible = result.discountsByCustomer.slice(0, visibleCount);
  const hasMore = result.discountsByCustomer.length > visibleCount;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>Discounts by Customer</div>
      <div className={styles.list}>
        {visible.map((line) => (
          <div key={line.label} className={styles.listRow} title={`${line.count} sale${line.count !== 1 ? "s" : ""}`}>
            <span className={styles.listLabel}>{line.label}</span>
            <span className={styles.listValue}>{fmt(line.amount)}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button onClick={() => setVisibleCount((n) => n + PAGE_SIZE)} className={styles.loadMoreButton}>
          Load More
        </button>
      )}
    </div>
  );
}
