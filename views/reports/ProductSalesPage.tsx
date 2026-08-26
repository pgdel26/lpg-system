import { useState, useMemo, useEffect, useRef } from "react";
import { presetThisMonth, presetLastMonth, today } from "../../lib/utils";
import { buildProductSalesReport, exportProductSalesWorkbook } from "../../lib/reports/productSales";
import { SearchIcon, DownloadIcon, ChevronDownIcon } from "../../components/Icons";
import type { Branch, SaleTransaction } from "../../lib/types";
import styles from "./ProductSalesPage.module.css";

interface ProductSalesPageProps {
  saleTransactions: SaleTransaction[];
  /** Sellable products from the catalog, for the picklist. */
  catalogProducts: string[];
  /** "YYYY-MM-DD" inclusive bounds. */
  startDate: string;
  endDate: string;
  onChangeRange: (startDate: string, endDate: string) => void;
  branches: Branch[];
  loading: boolean;
  error: string | null;
}

export default function ProductSalesPage({
  saleTransactions,
  catalogProducts,
  startDate,
  endDate,
  onChangeRange,
  branches,
  loading,
  error,
}: ProductSalesPageProps) {
  const [branch, setBranch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  const report = useMemo(
    () => buildProductSalesReport({
      saleTransactions,
      startDate,
      endDate,
      branch: branch || undefined,
      selectedProducts: selected,
    }),
    [saleTransactions, startDate, endDate, branch, selected],
  );

  // The picklist offers the catalog UNION whatever actually sold. The union
  // matters: a product deleted from the catalog, or one in a category no longer
  // sellable, can still have real sales in an older range — without it those
  // rows would be visible in the unfiltered report but impossible to tick.
  const pickerOptions = useMemo(() => {
    const names = new Set(catalogProducts);
    for (const name of report.productsWithSales) names.add(name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [catalogProducts, report.productsWithSales]);

  const productTerm = productSearch.trim().toLowerCase();
  const visibleOptions = productTerm
    ? pickerOptions.filter((p) => p.toLowerCase().includes(productTerm))
    : pickerOptions;

  // Close on click-outside and on Escape. Both listeners are torn down when the
  // panel closes, so nothing stays bound to the document while it's shut.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      // Reset on close, so reopening doesn't land on a term typed minutes ago
      // with the list already narrowed and autoFocus hiding why.
      setProductSearch("");
    };
  }, [pickerOpen]);

  const toggleProduct = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]));

  const invalidRange = !!startDate && !!endDate && startDate > endDate;

  const handleExport = () => {
    exportProductSalesWorkbook({
      report,
      startDate,
      endDate,
      branchName: branches.find((b) => b.id === branch)?.name,
      selectedCount: selected.length,
    });
  };

  const pickerLabel = selected.length === 0
    ? "All products"
    : `${selected.length} product${selected.length === 1 ? "" : "s"}`;

  return (
    <div className={`animate-fade ${styles.page}`}>
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="ps-start">From</label>
          <input
            id="ps-start"
            type="date"
            value={startDate}
            max={today()}
            onChange={(e) => e.target.value && onChangeRange(e.target.value, endDate)}
            className={styles.select}
          />
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="ps-end">To</label>
          <input
            id="ps-end"
            type="date"
            value={endDate}
            max={today()}
            onChange={(e) => e.target.value && onChangeRange(startDate, e.target.value)}
            className={styles.select}
          />
        </div>

        <button
          type="button"
          className={styles.presetButton}
          onClick={() => { const r = presetThisMonth(today()); onChangeRange(r.start, r.end); }}
        >
          This Month
        </button>
        <button
          type="button"
          className={styles.presetButton}
          onClick={() => { const r = presetLastMonth(today()); onChangeRange(r.start, r.end); }}
        >
          Last Month
        </button>

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

        {/* Products multi-select */}
        <div className={styles.controlGroup} ref={pickerRef}>
          <label className={styles.controlLabel} htmlFor="ps-products">Products</label>
          <div className={styles.pickerWrap}>
            <button
              id="ps-products"
              type="button"
              className={`${styles.pickerButton} ${selected.length > 0 ? styles.pickerActive : ""}`}
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
            >
              <span>{pickerLabel}</span>
              <ChevronDownIcon />
            </button>

            {pickerOpen && (
              <div className={styles.pickerPanel}>
                <div className={styles.pickerSearchWrap}>
                  <span className={styles.pickerSearchIcon}><SearchIcon /></span>
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Find a product"
                    className={styles.pickerSearchInput}
                    autoFocus
                  />
                </div>

                <div className={styles.pickerActions}>
                  <button
                    type="button"
                    className={styles.pickerAction}
                    onClick={() => setSelected((prev) => [...new Set([...prev, ...visibleOptions])])}
                  >
                    Select {productTerm ? "matching" : "all"}
                  </button>
                  <button
                    type="button"
                    className={styles.pickerAction}
                    onClick={() => setSelected([])}
                    disabled={selected.length === 0}
                  >
                    Clear
                  </button>
                </div>

                <div className={styles.pickerList}>
                  {visibleOptions.length === 0 ? (
                    <div className={styles.pickerEmpty}>No product matches.</div>
                  ) : visibleOptions.map((name) => (
                    <label key={name} className={styles.pickerOption}>
                      <input
                        type="checkbox"
                        checked={selected.includes(name)}
                        onChange={() => toggleProduct(name)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>

                {/* Says what an empty selection MEANS, because "nothing ticked"
                    reading as "everything" is not self-evident. */}
                <div className={styles.pickerFooter}>
                  {selected.length === 0
                    ? "Nothing ticked — showing every product that sold."
                    : `${selected.length} of ${pickerOptions.length} selected.`}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className={styles.exportButton}
          onClick={handleExport}
          disabled={loading || report.rows.length === 0}
          title={report.rows.length === 0 ? "Nothing to export in this range" : "Download as Excel"}
        >
          <DownloadIcon /> Export
        </button>
      </div>

      {/* This caveat lived only in lib/reports/productSales.ts's header, where the
          operator never sees it. A bold total with no unit statement is exactly
          the shape of a figure someone reconciles against stock movement. */}
      <p className={styles.caption}>
        Units sold. Excludes swaps and returns — a cylinder sold and later returned is still
        counted here.
      </p>

      {invalidRange && (
        <div className={styles.warning}>
          &quot;From&quot; is after &quot;To&quot; — no dates are in range. Widen the period to see data.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>Loading product sales…</div>
      ) : error ? (
        /* The error banner above already said it; a second "no sales" message
           underneath would read as a real, empty result. */
        null
      ) : report.rows.length === 0 ? (
        <div className={styles.empty}>
          No sales between {startDate} and {endDate}.
        </div>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.cornerHead}>Product</th>
                  <th className={styles.colHead}>Qty Sold</th>
                </tr>
              </thead>

              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.key} className={`${styles.row} ${row.noActivity ? styles.rowIdle : ""}`}>
                    <td className={styles.productCell}>
                      {row.label}
                      {/* Only ever on a product the user ticked deliberately —
                          it answers "did this sell nothing, or did I mis-filter". */}
                      {row.noActivity && <span className={styles.idleBadge}>no sales</span>}
                    </td>
                    <td className={styles.numCell}>
                      {row.quantity.toLocaleString("en-PH")}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className={styles.totalRow}>
                  <td className={styles.productCell}>TOTAL ITEMS</td>
                  <td className={styles.numCell}>
                    {report.totalQuantity.toLocaleString("en-PH")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
