import { useState, useMemo } from "react";
import { today } from "../../lib/utils";
import { buildCustomerOrdersMatrix, exportCustomerOrdersWorkbook } from "../../lib/reports/customerOrders";
import { SearchIcon, DownloadIcon } from "../../components/Icons";
import type { Branch, SaleTransaction } from "../../lib/types";
import styles from "./CustomerOrdersTab.module.css";

interface CustomerOrdersTabProps {
  saleTransactions: SaleTransaction[];
  /** "YYYY-MM-DD" inclusive bounds. */
  startDate: string;
  endDate: string;
  onChangeRange: (startDate: string, endDate: string) => void;
  branches: Branch[];
  loading: boolean;
  error: string | null;
}

export default function CustomerOrdersTab({
  saleTransactions,
  startDate,
  endDate,
  onChangeRange,
  branches,
  loading,
  error,
}: CustomerOrdersTabProps) {
  const [branch, setBranch] = useState("");
  const [search, setSearch] = useState("");

  const matrix = useMemo(
    () => buildCustomerOrdersMatrix({
      saleTransactions,
      startDate,
      endDate,
      branch: branch || undefined,
    }),
    [saleTransactions, startDate, endDate, branch],
  );

  const term = search.trim().toLowerCase();
  const visibleRows = useMemo(
    () => (term ? matrix.rows.filter((r) => r.name.toLowerCase().includes(term)) : matrix.rows),
    [matrix.rows, term],
  );

  const invalidRange = !!startDate && !!endDate && startDate > endDate;

  // Exports the rows as filtered, not the whole matrix — the file should match
  // what the operator is looking at when they click Export.
  const handleExport = () => {
    exportCustomerOrdersWorkbook({
      columns: matrix.columns,
      rows: visibleRows,
      startDate,
      endDate,
      branchName: branches.find((b) => b.id === branch)?.name,
      search: term ? search.trim() : undefined,
    });
  };

  // A cell reads "—" when the customer didn't order that product/type at all,
  // which is a different fact from a real zero (ordered then fully returned).
  const renderCell = (byColumn: Record<string, number>, key: string) => {
    const value = byColumn[key];
    if (value === undefined) return <span className={styles.dim}>—</span>;
    return value.toLocaleString("en-PH");
  };

  return (
    <div className="animate-fade">
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="co-start">From</label>
          <input
            id="co-start"
            type="date"
            value={startDate}
            max={today()}
            onChange={(e) => e.target.value && onChangeRange(e.target.value, endDate)}
            className={styles.select}
          />
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="co-end">To</label>
          <input
            id="co-end"
            type="date"
            value={endDate}
            max={today()}
            onChange={(e) => e.target.value && onChangeRange(startDate, e.target.value)}
            className={styles.select}
          />
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="co-branch">Outlet</label>
          <select
            id="co-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className={styles.select}
          >
            {/* Combined is the default: a customer can buy from either outlet,
                and the two share pooled profit, so splitting them by default
                would understate a customer's real volume. */}
            <option value="">All outlets</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer"
            className={styles.searchInput}
          />
        </div>

        <button
          type="button"
          className={styles.exportButton}
          onClick={handleExport}
          disabled={loading || visibleRows.length === 0}
          title={visibleRows.length === 0 ? "Nothing to export in this range" : "Download as Excel"}
        >
          <DownloadIcon /> Export
        </button>
      </div>

      {invalidRange && (
        <div className={styles.warning}>
          &quot;From&quot; is after &quot;To&quot; — no dates are in range. Widen the period to see data.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>Loading customer orders…</div>
      ) : error ? (
        /* The error banner above already said it; a second "no activity"
           message underneath would read as a real, empty result. */
        null
      ) : matrix.rows.length === 0 ? (
        <div className={styles.empty}>
          No orders between {startDate} and {endDate}.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className={styles.empty}>No customer matches &quot;{search.trim()}&quot;.</div>
      ) : (
        <div className={styles.tableCard}>
          {/* Scrolls on BOTH axes inside its own box. That bounded box is what
              makes the sticky header work: position:sticky resolves against the
              nearest scrolling ancestor, so without a height limit here the
              header would stick to the page viewport instead of the table. */}
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.cornerHead}>Customer</th>
                  {matrix.columns.map((col) => (
                    <th key={col.key} className={styles.colHead}>
                      <span className={styles.colProduct}>{col.product}</span>
                      <span className={`${styles.typeBadge} ${styles[col.section === "refill" ? "typeRefill" : col.isCylinder ? "typeFull" : "typeOther"]}`}>
                        {col.type}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key} className={styles.row}>
                    <td className={styles.customerCell}>{row.name}</td>
                    {matrix.columns.map((col) => (
                      <td key={col.key} className={styles.numCell}>
                        {renderCell(row.qtyByColumn, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        </div>
      )}
    </div>
  );
}
