import { Fragment, useState, useMemo } from "react";
import {
  buildProductSalesReport, buildProductCustomerRows, exportProductSalesWorkbook,
} from "../../lib/reports/productSales";
import type { ProductSalesPeriod } from "../../lib/reports/productSales";
import { SearchIcon, DownloadIcon, ChevronDownIcon } from "../../components/Icons";
import type { Branch, SaleTransaction } from "../../lib/types";
import styles from "./ProductSalesPage.module.css";

interface ProductSalesPageProps {
  /** Every sale across the whole window — the route page fetches it in one query. */
  saleTransactions: SaleTransaction[];
  /** The month columns, oldest first. */
  periods: ProductSalesPeriod[];
  branches: Branch[];
  loading: boolean;
  error: string | null;
}

export default function ProductSalesPage({
  saleTransactions,
  periods,
  branches,
  loading,
  error,
}: ProductSalesPageProps) {
  const [branch, setBranch] = useState("");
  const [search, setSearch] = useState("");
  // ONE open row at a time, by design — the owner asked that opening a product
  // close the others. A Set would allow several open at once and turn a six-row
  // table into forty rows of customers with no product headings in view.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Scoped to whichever product is open, and cleared when another is — a term
  // typed for one product would otherwise silently narrow the next one's
  // breakdown, with the box below the fold and nothing saying why.
  const [customerFilter, setCustomerFilter] = useState("");

  const toggleRow = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
    setCustomerFilter("");
  };

  const report = useMemo(
    () => buildProductSalesReport({ saleTransactions, periods, branch: branch || undefined }),
    [saleTransactions, periods, branch],
  );

  // Search narrows what is SHOWN; it never changes what the report counted, the
  // same way the Target Volume grid's search works. Matched on the printed
  // label, so typing a category ("deposit") finds the disambiguated rows too.
  const term = search.trim().toLowerCase();
  const visibleRows = useMemo(
    () => (term ? report.rows.filter((r) => r.label.toLowerCase().includes(term)) : report.rows),
    [report.rows, term],
  );

  const expandedRow = report.rows.find((r) => r.key === expandedKey) || null;

  // Only ever built for the ONE product that is open. Recomputed when the
  // outlet or the window changes, which is also when the figures behind it move.
  const customerRows = useMemo(
    () => (expandedRow
      ? buildProductCustomerRows({
        saleTransactions,
        periods,
        branch: branch || undefined,
        product: expandedRow.product,
        category: expandedRow.category,
      })
      : []),
    [expandedRow, saleTransactions, periods, branch],
  );

  const customerTerm = customerFilter.trim().toLowerCase();
  const visibleCustomerRows = customerTerm
    ? customerRows.filter((c) => c.name.toLowerCase().includes(customerTerm))
    : customerRows;

  const handleExport = () => {
    exportProductSalesWorkbook({
      report,
      periods,
      branchName: branches.find((b) => b.id === branch)?.name,
    });
  };

  const first = periods[0];
  const last = periods[periods.length - 1];

  return (
    <div className={`animate-fade ${styles.page}`}>
      <div className={styles.controls}>
        {/* The window is fixed, so it is stated rather than picked. Without this
            the table's only clue to what it covers is six column headings. */}
        <span className={styles.windowLabel}>
          {first.label} – {last.label}
        </span>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="ps-branch">Outlet</label>
          <select
            id="ps-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className={styles.select}
          >
            <option value="">All outlets</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product"
            className={styles.searchInput}
            aria-label="Search product"
          />
        </div>

        <button
          type="button"
          className={styles.exportButton}
          onClick={handleExport}
          disabled={loading || report.rows.length === 0}
          title={report.rows.length === 0 ? "Nothing to export in this window" : "Download as Excel"}
        >
          <DownloadIcon /> Export
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>Loading product sales…</div>
      ) : error ? (
        /* The error banner above already said it; a second "no sales" message
           underneath would read as a real, empty result. */
        null
      ) : report.rows.length === 0 ? (
        <div className={styles.empty}>
          No sales between {first.startDate} and {last.endDate}.
        </div>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.cornerHead}>Product</th>
                  {periods.map((period) => (
                    <th
                      key={period.label}
                      className={`${styles.colHead} ${period.partial ? styles.colHeadPartial : ""}`}
                    >
                      {period.label}
                      {/* Marked on the heading itself: this is the column the
                          eye lands on when it looks like a drop. */}
                      {period.partial && <span className={styles.partialNote}>to date</span>}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td className={styles.noMatch} colSpan={periods.length + 1}>
                      No product matches “{search.trim()}”.
                    </td>
                  </tr>
                ) : visibleRows.map((row) => {
                  const isOpen = row.key === expandedKey;
                  return (
                    <Fragment key={row.key}>
                      {/* The whole row is the control — a product row has nothing
                          else to click, and a hit target the width of the table
                          beats hunting for a chevron. */}
                      <tr
                        className={`${styles.row} ${styles.rowClickable} ${isOpen ? styles.rowOpen : ""}`}
                        onClick={() => toggleRow(row.key)}
                        aria-expanded={isOpen}
                      >
                        <td className={styles.productCell}>
                          <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>
                            <ChevronDownIcon />
                          </span>
                          {row.label}
                        </td>
                        {row.quantities.map((qty, i) => (
                          <td key={periods[i].label} className={styles.numCell}>
                            {qty.toLocaleString("en-PH")}
                          </td>
                        ))}
                      </tr>

                      {/* The filter row only appears once there is enough of a
                          list to be worth narrowing. Below that it would be a
                          control that costs a line and saves nothing. */}
                      {isOpen && customerRows.length > 1 && (
                        <tr className={styles.childRow}>
                          <td className={styles.filterCell} colSpan={periods.length + 1}>
                            <span className={styles.filterIcon}><SearchIcon /></span>
                            <input
                              value={customerFilter}
                              onChange={(e) => setCustomerFilter(e.target.value)}
                              placeholder={`Filter customers of ${row.product}`}
                              className={styles.filterInput}
                              aria-label={`Filter customers of ${row.product}`}
                            />
                            {customerTerm && (
                              <span className={styles.filterCount}>
                                {visibleCustomerRows.length} of {customerRows.length}
                              </span>
                            )}
                          </td>
                        </tr>
                      )}

                      {isOpen && (customerRows.length === 0 ? (
                        <tr className={styles.childRow}>
                          <td className={styles.childEmpty} colSpan={periods.length + 1}>
                            No customer on these sales.
                          </td>
                        </tr>
                      ) : visibleCustomerRows.length === 0 ? (
                        <tr className={styles.childRow}>
                          <td className={styles.childEmpty} colSpan={periods.length + 1}>
                            No customer of {row.product} matches “{customerFilter.trim()}”.
                          </td>
                        </tr>
                      ) : visibleCustomerRows.map((c) => (
                        <tr key={`${row.key}|${c.key}`} className={styles.childRow}>
                          <td className={styles.customerCell}>{c.name}</td>
                          {c.quantities.map((qty, i) => (
                            <td key={periods[i].label} className={styles.childNumCell}>
                              {/* A customer who bought none THIS month, having
                                  bought in another, reads as "—" rather than 0:
                                  the zero is arithmetic, the dash is silence. */}
                              {qty === 0 ? <span className={styles.dim}>—</span> : qty.toLocaleString("en-PH")}
                            </td>
                          ))}
                        </tr>
                      )))}
                    </Fragment>
                  );
                })}
              </tbody>

              <tfoot>
                {/* Totals stay across EVERY product, not just the matching ones:
                    a month's units sold is a fact about the month, and a footer
                    that dropped while someone typed would be useless to act on.
                    The label says so while a search is narrowing the rows. */}
                <tr className={styles.totalRow}>
                  <td className={styles.productCell}>
                    TOTAL ITEMS{term ? " (all products)" : ""}
                  </td>
                  {report.totals.map((total, i) => (
                    <td key={periods[i].label} className={styles.numCell}>
                      {total.toLocaleString("en-PH")}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
