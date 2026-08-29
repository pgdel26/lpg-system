import { useState, useMemo } from "react";
import { today, presetThisMonth, presetLastMonth } from "../../lib/utils";
import { buildCustomerOrdersMatrix, exportCustomerOrdersWorkbook } from "../../lib/reports/customerOrders";
import { SearchIcon, DownloadIcon } from "../../components/Icons";
import ProductPicker from "./ProductPicker";
import { buildTargetStatusIndex, formatMonth, monthOf } from "../../lib/customerTargets";
import type { CustomerTargetStatus } from "../../lib/customerTargets";
import type { Branch, CustomerTarget, SaleTransaction } from "../../lib/types";
import styles from "./CustomerOrdersTab.module.css";

interface CustomerOrdersTabProps {
  saleTransactions: SaleTransaction[];
  /** "YYYY-MM-DD" inclusive bounds. */
  startDate: string;
  endDate: string;
  onChangeRange: (startDate: string, endDate: string) => void;
  branches: Branch[];
  /** Every target, all months — narrowed to the range's month here. */
  targets: CustomerTarget[];
  /** Categories a sale must be in to count toward a target — see targetProductScope. */
  targetCategories: string[];
  /** The month the tags read, or null when the range spans more than one. */
  targetMonth: string | null;
  /**
   * The WHOLE target month's sales, fetched separately by the route page.
   *
   * NOT the grid's own array: that holds only the picked range, and a target is
   * measured over the whole month. Counting a half-month of sales against a
   * full-month target is how this screen would contradict Target Volume.
   */
  targetMonthSales: SaleTransaction[];
  loading: boolean;
  error: string | null;
}

export default function CustomerOrdersTab({
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
}: CustomerOrdersTabProps) {
  const [branch, setBranch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [metOnly, setMetOnly] = useState(false);

  const matrix = useMemo(
    () => buildCustomerOrdersMatrix({
      saleTransactions,
      startDate,
      endDate,
      branch: branch || undefined,
    }),
    [saleTransactions, startDate, endDate, branch],
  );

  // Picklist of products actually ordered in the range. Current picks are
  // unioned in even when the range no longer contains them — dropping one would
  // leave it ticked but invisible, with nothing saying which product the table
  // is empty OF.
  const productOptions = useMemo(() => {
    const names = new Set(matrix.columns.map((c) => c.product));
    for (const p of selectedProducts) names.add(p);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [matrix.columns, selectedProducts]);

  // Filtering by product narrows the COLUMNS — a product's Refill and Full
  // Cylinder stay side by side, because "how much 11KG did they take" is asked
  // of the pair, not of one type. EMPTY MEANS ALL, the same convention the
  // report's own picker used.
  const productFilter = useMemo(() => new Set(selectedProducts), [selectedProducts]);
  const baseColumns = useMemo(
    () => (productFilter.size > 0
      ? matrix.columns.filter((c) => productFilter.has(c.product))
      : matrix.columns),
    [matrix.columns, productFilter],
  );

  const term = search.trim().toLowerCase();
  const searchedRows = useMemo(
    () => matrix.rows.filter((r) =>
      (!term || r.name.toLowerCase().includes(term))
      // With products picked, a customer who ordered none of them would be a row
      // of nothing but em-dashes. Sorting still ranks on the WHOLE range's
      // total, so a heavy 11KG buyer can sit below a bigger overall customer.
      && (productFilter.size === 0
        || baseColumns.some((c) => r.qtyByColumn[c.key] !== undefined))),
    [matrix.rows, term, productFilter, baseColumns],
  );

  // Names the picked products in prose. Listed in full up to three, because
  // "3 products" in an empty-state message tells the reader nothing about which
  // ones came back empty.
  const selectedLabel = selectedProducts.length === 0
    ? "these products"
    : selectedProducts.length <= 3
      ? selectedProducts.join(", ")
      : `${selectedProducts.length} selected products`;

  const pickerLabel = selectedProducts.length === 0
    ? "All products"
    : selectedProducts.length === 1
      ? selectedProducts[0]
      : `${selectedProducts.length} products`;

  // Built from the month's UNFILTERED sales on purpose, on both counts: the
  // whole month because that is the period agreed, and every outlet because
  // PILI and CADLAN pool profit, so splitting orders between them must not cost
  // someone their target. The outlet filter and the date pickers narrow the
  // cells beside the tag, never the tag itself.
  const targetIndex = useMemo(
    () => (targetMonth
      ? buildTargetStatusIndex({
        targets,
        saleTransactions: targetMonthSales,
        month: targetMonth,
        countedCategories: targetCategories,
      })
      // Typed, not a bare `new Map()`: an untyped empty branch widens the union
      // to Map<any, any> and every field read off a status below stops being
      // checked — a typo in the tooltip would compile.
      : new Map<string, CustomerTargetStatus>()),
    [targetMonth, targets, targetMonthSales, targetCategories],
  );

  const hasTags = targetIndex.size > 0;

  /** `customerId|product` for every target actually MET this month. */
  const metPairs = useMemo(() => {
    const met = new Set<string>();
    for (const [key, status] of targetIndex) if (status.reached) met.add(key);
    return met;
  }, [targetIndex]);

  // "Target met" narrows BOTH axes, and in that order: keep the customers who
  // met one, then keep only the products they met it on. Doing it the other way
  // round — columns first — would leave a customer's row visible next to a
  // product they merely bought a lot of.
  const canFilterMet = metPairs.size > 0;
  const showMetOnly = metOnly && canFilterMet;

  // Untick on the way out rather than leaving the box unticked while the state
  // says otherwise — a filter that silently reapplies when the range narrows
  // again is a filter nobody remembers turning on. Done on the change itself,
  // not in an effect: this is a consequence of the operator's action.
  const changeRange = (start: string, end: string) => {
    if (monthOf(start) !== monthOf(end)) setMetOnly(false);
    onChangeRange(start, end);
  };

  const visibleRows = useMemo(
    () => (showMetOnly
      ? searchedRows.filter((r) => !!r.customerId
        && baseColumns.some((c) => metPairs.has(`${r.customerId}|${c.product}`)))
      : searchedRows),
    [searchedRows, showMetOnly, baseColumns, metPairs],
  );

  const visibleColumns = useMemo(
    () => (showMetOnly
      ? baseColumns.filter((c) => visibleRows.some(
        (r) => r.customerId && metPairs.has(`${r.customerId}|${c.product}`)))
      : baseColumns),
    [baseColumns, showMetOnly, visibleRows, metPairs],
  );

  // A product's target covers every type of it, so the tag is drawn once per
  // product — on its leftmost visible column — instead of on both the Refill
  // and Full Cylinder cells, where it would read as two separate agreements.
  const tagColumnKeys = useMemo(() => {
    const first = new Map<string, string>();
    for (const col of visibleColumns) {
      if (!first.has(col.product)) first.set(col.product, col.key);
    }
    return new Set(first.values());
  }, [visibleColumns]);

  const invalidRange = !!startDate && !!endDate && startDate > endDate;

  // Exports the rows and columns as filtered, not the whole matrix — the file
  // should match what the operator is looking at when they click Export.
  const handleExport = () => {
    exportCustomerOrdersWorkbook({
      columns: visibleColumns,
      rows: visibleRows,
      startDate,
      endDate,
      branchName: branches.find((b) => b.id === branch)?.name,
      products: selectedProducts.length > 0 ? [...selectedProducts].sort((a, b) => a.localeCompare(b)) : undefined,
      search: term ? search.trim() : undefined,
      metOnly: showMetOnly,
    });
  };

  // A cell reads "—" when there is no sale document for that product/type at
  // all, which is a different fact from a document carrying no units. It is
  // NOT about returns — this report never nets refunds off.
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
            onChange={(e) => e.target.value && changeRange(e.target.value, endDate)}
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
            onChange={(e) => e.target.value && changeRange(startDate, e.target.value)}
            className={styles.select}
          />
        </div>

        {/* Same two presets, same wording, as the Income Statement's period bar —
            they set both pickers at once rather than being a mode of their own,
            so the range stays readable in the From/To fields afterwards. */}
        <button
          type="button"
          className={styles.presetButton}
          onClick={() => { const r = presetThisMonth(today()); changeRange(r.start, r.end); }}
        >
          This Month
        </button>
        <button
          type="button"
          className={styles.presetButton}
          onClick={() => { const r = presetLastMonth(today()); changeRange(r.start, r.end); }}
        >
          Last Month
        </button>

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

        {/* A single-pick dropdown could only ever answer "how much 11KG";
            comparing two products for one customer is the question this table
            exists for. */}
        <ProductPicker
          id="co-products"
          options={productOptions}
          selected={selectedProducts}
          onChange={setSelectedProducts}
        />

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer"
            className={styles.searchInput}
          />
        </div>

        {/* Disabled rather than hidden when nothing qualifies: "no targets were
            met" is an answer, and a control that vanishes leaves the operator
            wondering whether the feature is there at all. */}
        <label
          className={`${styles.metToggle} ${showMetOnly ? styles.metToggleOn : ""} ${canFilterMet ? "" : styles.metToggleDisabled}`}
          title={canFilterMet
            ? "Show only customers who met a target this month, and only the products they met it on"
            : targetMonth
              ? "No target was met in this month"
              : "Targets are a whole-month agreement — narrow the range to one month"}
        >
          <input
            type="checkbox"
            checked={showMetOnly}
            disabled={!canFilterMet}
            onChange={(e) => setMetOnly(e.target.checked)}
          />
          <span>Target met only</span>
        </label>

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
      ) : visibleColumns.length === 0 ? (
        /* The range HAS orders, just none of these products — said out loud,
           because an empty table under a filter reads as a broken screen. */
        <div className={styles.empty}>
          No orders of {selectedLabel} between {startDate} and {endDate}.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className={styles.empty}>
          {showMetOnly
            ? <>No customer met a target{selectedProducts.length > 0 ? ` on ${selectedLabel}` : ""}{term ? ` matching “${search.trim()}”` : ""} in this month.</>
            : term
              ? <>No customer matches &quot;{search.trim()}&quot;{selectedProducts.length > 0 ? ` for ${selectedLabel}` : ""}.</>
              : <>No customer ordered {selectedLabel} between {startDate} and {endDate}.</>}
        </div>
      ) : (
        <>
          {/* Only when something is actually tagged. Two marks need decoding, and
              a legend for marks that aren't on screen is just clutter. */}
          {hasTags && (
            <div className={styles.legend}>
              <span className={`${styles.targetTag} ${styles.targetMet}`}>✓</span>
              <span>target met</span>
              <span className={`${styles.targetTag} ${styles.targetShort}`}>12</span>
              <span>units still needed — whole month, all outlets, all types</span>
            </div>
          )}
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
                    {visibleColumns.map((col) => (
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
                      {visibleColumns.map((col) => {
                        const status = row.customerId && tagColumnKeys.has(col.key)
                          ? targetIndex.get(`${row.customerId}|${col.product}`)
                          : undefined;
                        return (
                          <td key={col.key} className={styles.numCell}>
                            {renderCell(row.qtyByColumn, col.key)}
                            {/* The figure beside it is this outlet's, this type's.
                                The tag is the whole month, every outlet, every
                                type — which is what was agreed — so the tooltip
                                spells the target's own numbers out rather than
                                leaving them to be inferred from the cell. */}
                            {status && (
                              <span
                                className={`${styles.targetTag} ${status.reached ? styles.targetMet : styles.targetShort}`}
                                title={`${col.product} target ${status.actualQty.toLocaleString("en-PH")}/${status.targetQty.toLocaleString("en-PH")} for ${formatMonth(status.month)} — all outlets, all types.${status.reached ? "" : ` ${status.remaining.toLocaleString("en-PH")} to go.`}`}
                              >
                                {status.reached ? "✓" : status.remaining.toLocaleString("en-PH")}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
