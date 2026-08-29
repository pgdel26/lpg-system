import CustomerOrdersTab from "./CustomerOrdersTab";
import type { Branch, CustomerTarget, SaleTransaction } from "../../lib/types";
import styles from "./ReportsPage.module.css";

// No subtab bar: the sidebar's Reports group lists each report by name, so a
// single tab labelled "Volume Per Customer" under a header already reading
// "Volume Per Customer" was saying the same thing three times. A new report is a
// nav child plus its own route now, not a tab here.
interface ReportsPageProps {
  saleTransactions: SaleTransaction[];
  startDate: string;
  endDate: string;
  onChangeRange: (startDate: string, endDate: string) => void;
  branches: Branch[];
  /** Every target, all months — the tab narrows to the range's month. */
  targets: CustomerTarget[];
  /** Categories a sale must be in to count toward a target. */
  targetCategories: string[];
  /** The month the tags read, or null when the range spans more than one. */
  targetMonth: string | null;
  /** The WHOLE target month's sales — not the picked range. See the route page. */
  targetMonthSales: SaleTransaction[];
  loading: boolean;
  error: string | null;
}

export default function ReportsPage({
  saleTransactions,
  startDate,
  endDate,
  onChangeRange,
  branches,
  targets,
  targetCategories,
  targetMonth,
  targetMonthSales,
  loading,
  error,
}: ReportsPageProps) {
  return (
    <div className={styles.card}>
      <CustomerOrdersTab
        saleTransactions={saleTransactions}
        startDate={startDate}
        endDate={endDate}
        onChangeRange={onChangeRange}
        branches={branches}
        targets={targets}
        targetCategories={targetCategories}
        targetMonth={targetMonth}
        targetMonthSales={targetMonthSales}
        loading={loading}
        error={error}
      />
    </div>
  );
}
