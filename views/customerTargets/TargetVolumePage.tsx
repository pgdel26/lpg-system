import { useMemo, useState } from "react";
import { SearchIcon } from "../../components/Icons";
import {
  buildCustomerTargetSummaries, buildProductTargetRows, formatMonth, monthOf,
  previousMonth, summarizeProductTargets,
  type ProductTargetRow,
} from "../../lib/customerTargets";
import { today } from "../../lib/utils";
import type { Customer, CustomerCategory, CustomerTarget, SaleTransaction } from "../../lib/types";
import styles from "./TargetVolumePage.module.css";

interface TargetVolumePageProps {
  /** "YYYY-MM". */
  month: string;
  onChangeMonth: (month: string) => void;
  customers: Customer[];
  /** The filing scheme, for narrowing the customer list. */
  customerCategories: CustomerCategory[];
  /** Every sellable product — the rows of the right grid. */
  products: string[];
  /** Every target, all months — filtered to `month` here. */
  targets: CustomerTarget[];
  /** Sales spanning `month`. */
  saleTransactions: SaleTransaction[];
  /** Categories a sale must be in to count — see targetProductScope. */
  countedCategories: string[];
  onSaveTarget: (
    customerId: string, month: string, product: string,
    targetQty: number, discountPerUnit: number,
  ) => Promise<void>;
  onRemoveTarget: (customerId: string, month: string, product: string) => Promise<void>;
  onCopyTargets: (fromMonth: string, toMonth: string) => Promise<number>;
  loading: boolean;
  error: string | null;
}

export default function TargetVolumePage({
  month,
  onChangeMonth,
  customers,
  customerCategories,
  products,
  targets,
  saleTransactions,
  countedCategories,
  onSaveTarget,
  onRemoveTarget,
  onCopyTargets,
  loading,
  error,
}: TargetVolumePageProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyTargeted, setOnlyTargeted] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  // categoryId by customer, so the filter reads it without a .find() per row on
  // a list that runs to hundreds. buildCustomerTargetSummaries deliberately
  // doesn't carry the category — it is about targets, not about filing.
  const categoryOfCustomer = useMemo(
    () => new Map(customers.map((c) => [c.id, c.categoryId || ""])),
    [customers],
  );

  // Left pane: every customer, with a count of the agreements they have. The
  // counts are what make a list of hundreds navigable — they mark the handful
  // of customers anything has been set for.
  const customerRows = useMemo(
    () => buildCustomerTargetSummaries({
      customers, targets, saleTransactions, month, countedCategories,
    }),
    [customers, targets, saleTransactions, month, countedCategories],
  );

  const term = search.trim().toLowerCase();
  const visibleCustomers = useMemo(
    () => customerRows.filter((r) =>
      (!onlyTargeted || r.targetedCount > 0)
      && (!categoryFilter || categoryOfCustomer.get(r.customerId) === categoryFilter)
      && (!term || r.customerName.toLowerCase().includes(term))),
    [customerRows, term, onlyTargeted, categoryFilter, categoryOfCustomer],
  );

  const selected = customerRows.find((r) => r.customerId === selectedId) || null;

  // Right pane: one row per product, for the selected customer only. Built even
  // with nobody selected (it returns an empty list), so the hook order stays
  // fixed — a useMemo can't sit behind an early return.
  const productRows = useMemo(
    () => (selectedId
      ? buildProductTargetRows({
        customerId: selectedId, products, targets, saleTransactions, month, countedCategories,
      })
      : []),
    [selectedId, products, targets, saleTransactions, month, countedCategories],
  );

  const summary = summarizeProductTargets(productRows);
  const prev = previousMonth(month);
  const isPastMonth = month < monthOf(today());

  /**
   * Commits one edited cell.
   *
   * Clearing BOTH numbers to zero deletes that product's target document rather
   * than storing a row of zeroes — that is what "no agreement on this product"
   * means, and it keeps a mis-typed row from lingering as a permanent blank. A
   * zero in only one of the two is a legitimate value and is kept.
   */
  const commit = (row: ProductTargetRow, field: "target" | "discount", raw: string) => {
    if (!selectedId) return;
    const value = parseFloat(raw) || 0;
    const current = field === "target" ? row.targetQty : row.discountPerUnit;
    if (value === current) return; // untouched, or retyped to the same figure

    const targetQty = field === "target" ? value : row.targetQty;
    const discountPerUnit = field === "discount" ? value : row.discountPerUnit;

    if (targetQty === 0 && discountPerUnit === 0) {
      if (row.hasTarget) void onRemoveTarget(selectedId, month, row.product);
      return;
    }
    void onSaveTarget(selectedId, month, row.product, targetQty, discountPerUnit);
  };

  return (
    <div className={`animate-fade ${styles.page}`}>
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="tv-month">Month</label>
          <input
            id="tv-month"
            type="month"
            value={month}
            onChange={(e) => e.target.value && onChangeMonth(e.target.value)}
            className={styles.select}
          />
        </div>

        <button
          type="button"
          className={styles.presetButton}
          onClick={() => { void onCopyTargets(prev, month); }}
          title={`Copy every target set for ${formatMonth(prev)} into ${formatMonth(month)}, skipping products that already have one here`}
        >
          Copy from {formatMonth(prev)}
        </button>
      </div>

      {isPastMonth && (
        <div className={styles.notice}>
          {formatMonth(month)} is a past month. Editing a target here changes what that month
          earned, after the fact.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>Loading {formatMonth(month)}…</div>
      ) : (
        /* Master-detail: pick a customer on the left, set that customer's
           per-product agreements on the right. The list has to stay on screen
           while the grid is edited — the operator works through a handful of
           customers in one sitting, and a drill-down would make every switch a
           navigation. */
        <div className={styles.split}>
          <div className={styles.customerPane}>
            {/* Stacked rather than one row: the pane is 300px wide, and three
                controls side by side would each be too narrow to read. */}
            <div className={styles.listControls}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}><SearchIcon /></span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customer"
                  className={styles.searchInput}
                  aria-label="Search customer"
                />
              </div>
              <div className={styles.listFilters}>
                {/* Hidden until categories exist, so the pane doesn't carry an
                    empty control on a database nobody has filed yet. */}
                {customerCategories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className={`${styles.select} ${categoryFilter ? styles.selectActive : ""}`}
                    aria-label="Filter by category"
                  >
                    <option value="">All categories</option>
                    {customerCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                <label className={styles.filterToggle}>
                  <input
                    type="checkbox"
                    checked={onlyTargeted}
                    onChange={(e) => setOnlyTargeted(e.target.checked)}
                  />
                  <span>With targets only</span>
                </label>
              </div>
            </div>

            <div className={styles.customerList}>
              {visibleCustomers.length === 0 ? (
                <div className={styles.paneEmpty}>
                  {customerRows.length === 0
                    ? "No customers yet."
                    : `No customer matches${term ? ` “${search.trim()}”` : ""}${categoryFilter ? " in this category" : ""}${onlyTargeted ? " with a target set" : ""}.`}
                </div>
              ) : visibleCustomers.map((row) => (
                <button
                  key={row.customerId}
                  type="button"
                  onClick={() => setSelectedId(row.customerId)}
                  className={`${styles.customerItem} ${row.customerId === selectedId ? styles.customerItemActive : ""}`}
                >
                  <span className={styles.customerName}>{row.customerName}</span>
                  {/* Only ever on a customer with agreements. Reads
                      "reached/set", so a glance down the list says who is on
                      track without opening each one. */}
                  {row.targetedCount > 0 && (
                    <span className={`${styles.countBadge} ${row.reachedCount === row.targetedCount ? styles.countBadgeAll : ""}`}>
                      {row.reachedCount}/{row.targetedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className={styles.paneFoot}>
              {visibleCustomers.length.toLocaleString("en-PH")} of {customerRows.length.toLocaleString("en-PH")} customers
            </div>
          </div>

          <div className={styles.productPane}>
            {!selected ? (
              <div className={styles.paneEmpty}>
                Pick a customer on the left to set their targets for {formatMonth(month)}.
              </div>
            ) : (
              <>
                <div className={styles.paneHead}>
                  <div>
                    <div className={styles.selectedName}>{selected.customerName}</div>
                    <div className={styles.selectedSub}>
                      {formatMonth(month)} — {summary.targetedCount === 0
                        ? "no targets set"
                        : `${summary.reachedCount} of ${summary.targetedCount} reached`}
                    </div>
                  </div>
                </div>

                {productRows.length === 0 ? (
                  <div className={styles.paneEmpty}>No products in the catalog yet.</div>
                ) : (
                  <div className={styles.tableScroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.cornerHead}>Product</th>
                          <th className={styles.colHead}>Target Volume</th>
                          <th className={styles.colHead}>Discount (₱/unit)</th>
                          <th className={styles.colHead}>Actual</th>
                        </tr>
                      </thead>

                      <tbody>
                        {productRows.map((row) => (
                          <tr key={row.product} className={`${styles.row} ${row.reached ? styles.rowReached : ""}`}>
                            <td className={styles.productCell}>{row.product}</td>

                            {/* Uncontrolled, committing on blur and on Enter.
                                The key carries the customer and the month, so
                                switching either remounts the inputs with that
                                combination's figures; a controlled input would
                                need a draft map kept in sync with every save to
                                achieve the same thing. Empty rather than "0"
                                when nothing is set — a column of zeroes reads
                                as a decision someone made. */}
                            <td className={styles.numCell}>
                              <input
                                key={`t-${selectedId}-${month}-${row.product}`}
                                type="number"
                                min="0"
                                defaultValue={row.hasTarget && row.targetQty ? row.targetQty : ""}
                                placeholder="—"
                                onBlur={(e) => commit(row, "target", e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                className={styles.cellInput}
                                aria-label={`Target volume of ${row.product} for ${selected.customerName}`}
                              />
                            </td>

                            {/* Money, so it carries the peso sign and two
                                decimals. The ₱ sits beside the field rather
                                than inside it: a number input can only hold a
                                number, and typing into a text field that
                                accepts "₱2.00" would mean parsing currency back
                                out of free text on every keystroke. Shown only
                                once something is set — a lone ₱ against an
                                empty row would read as zero pesos agreed. */}
                            <td className={styles.numCell}>
                              <span className={styles.moneyField}>
                                <span className={row.discountPerUnit ? styles.pesoSign : styles.pesoSignBlank}>₱</span>
                                <input
                                  key={`d-${selectedId}-${month}-${row.product}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={row.hasTarget && row.discountPerUnit ? row.discountPerUnit.toFixed(2) : ""}
                                  placeholder="—"
                                  onBlur={(e) => commit(row, "discount", e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                  className={styles.cellInput}
                                  title="Pesos off each unit of this product, once its target volume is reached"
                                  aria-label={`Discount in pesos per unit of ${row.product} for ${selected.customerName}`}
                                />
                              </span>
                            </td>

                            {/* Read-only: units of this product bought this
                                month, across every outlet. The progress note
                                sits inside the cell rather than in a Status
                                column of its own — it is a reading of this
                                number, not a separate figure. */}
                            <td className={styles.numCell}>
                              <span className={styles.actualValue}>
                                {row.actualQty.toLocaleString("en-PH")}
                              </span>
                              {row.targetQty > 0 && (
                                <span className={row.reached ? styles.reachedNote : styles.shortNote}>
                                  {row.reached
                                    ? `reached ${row.targetQty.toLocaleString("en-PH")}`
                                    : `${row.remaining.toLocaleString("en-PH")} to go`}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
