import CustomerOrdersTab from "./CustomerOrdersTab";
import type { Branch, SaleTransaction } from "../../lib/types";
import styles from "./ReportsPage.module.css";

// No subtab bar: the sidebar's Reports group lists each report by name, so a
// single tab labelled "Customer Orders" under a header already reading "Customer
// Orders" was saying the same thing three times. A new report is a nav child
// plus its own route now, not a tab here.
interface ReportsPageProps {
  saleTransactions: SaleTransaction[];
  startDate: string;
  endDate: string;
  onChangeRange: (startDate: string, endDate: string) => void;
  branches: Branch[];
  loading: boolean;
  error: string | null;
}

export default function ReportsPage({
  saleTransactions,
  startDate,
  endDate,
  onChangeRange,
  branches,
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
        loading={loading}
        error={error}
      />
    </div>
  );
}
