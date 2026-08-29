import { useMemo, useState } from "react";
import { SearchIcon, EditIcon, HistoryIcon } from "../../components/Icons";
import { fmt } from "../../lib/utils";
import SetDiscountModal from "../../components/SetDiscountModal";
import DiscountHistoryModal from "../../components/DiscountHistoryModal";
import {
  buildCustomerTargetSummaries, buildProductTargetRows, formatMonth,
  summarizeProductTargets,
  type ProductTargetRow,
} from "../../lib/customerTargets";
import type { Customer, CustomerCategory, CustomerTarget, SaleTransaction } from "../../lib/types";
import styles from "./TargetVolumePage.module.css";

interface TargetVolumePageProps {
  /**
   * The month the VOLUME is measured over — always the current one. Not a
   * filter: the agreements are standing, so there is no other month to look at.
   * Still a prop because the route page owns the fetch it comes from.
   */
  month: string;
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
  /** Sets the target VOLUME only — the discount has its own path, so it is logged. */
  onSaveTargetQty: (customerId: string, product: string, targetQty: number) => Promise<void>;
  onSetDiscount: (
    customerId: string, product: string, discountPerUnit: number,
  ) => Promise<boolean>;
  onRemoveTarget: (customerId: string, product: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export default function TargetVolumePage({
  month,
  customers,
  customerCategories,
  products,
  targets,
  saleTransactions,
  countedCategories,
  onSaveTargetQty,
  onSetDiscount,
  onRemoveTarget,
  loading,
  error,
}: TargetVolumePageProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyTargeted, setOnlyTargeted] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  // Which product row has a dialog open, and which one. Held by product name
  // rather than by row object: the rows are rebuilt on every sales refresh, and
  // a captured row would go stale under an open dialog.
  const [discountFor, setDiscountFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

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

  /**
   * Commits an edited target volume.
   *
   * Clearing it to zero on a row with no discount deletes the document rather
   * than storing a row of zeroes — that is what "no agreement on this product"
   * means, and it keeps a mis-typed row from lingering as a permanent blank. A
   * zero volume against a live discount is a legitimate state and is kept.
   *
   * The discount is NOT settable here: it goes through the dialog, which logs
   * it. That is the whole reason its cell is read-only.
   */
  const commitTargetQty = (row: ProductTargetRow, raw: string) => {
    if (!selectedId) return;
    const value = parseFloat(raw) || 0;
    if (value === row.targetQty) return; // untouched, or retyped to the same figure

    if (value === 0 && row.discountPerUnit === 0) {
      if (row.hasTarget) void onRemoveTarget(selectedId, row.product);
      return;
    }
    void onSaveTargetQty(selectedId, row.product, value);
  };

  const openRow = (product: string) => productRows.find((r) => r.product === product) || null;

  return (
    <div className={`animate-fade ${styles.page}`}>
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
                Pick a customer on the left to set their target volumes and discounts.
              </div>
            ) : (
              <>
                <div className={styles.paneHead}>
                  <div>
                    <div className={styles.selectedName}>{selected.customerName}</div>
                    <div className={styles.selectedSub}>
                      {summary.targetedCount === 0
                        ? "No targets set"
                        : `${summary.reachedCount} of ${summary.targetedCount} reached in ${formatMonth(month)}`}
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
                          {/* Names its month. The screen has no month control
                              any more — the agreement is standing — so without
                              this the one figure that DOES move month to month
                              would be the one with nothing saying so. */}
                          <th className={styles.colHead}>
                            Actual
                            <span className={styles.colHeadSub}>{formatMonth(month)}</span>
                          </th>
                          <th className={styles.actionsHead} />
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
                                onBlur={(e) => commitTargetQty(row, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                className={styles.cellInput}
                                aria-label={`Target volume of ${row.product} for ${selected.customerName}`}
                              />
                            </td>

                            {/* READ-ONLY, and that is the point: the discount is
                                set through the dialog on the right, which logs
                                the change. A typeable cell here would be a
                                second way to change the rate, and the history
                                would have holes exactly where someone was in a
                                hurry. */}
                            <td className={styles.numCell}>
                              <span className={styles.discountValue}>
                                {row.discountPerUnit > 0
                                  ? fmt(row.discountPerUnit)
                                  : <span className={styles.dim}>—</span>}
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

                            {/* Icons rather than labels: one pair per row on a
                                grid this long, and a column of worded buttons
                                would outweigh the figures they act on. Both
                                carry a title and an aria-label naming the
                                product they belong to. */}
                            <td className={styles.actionsCell}>
                              <button
                                type="button"
                                onClick={() => setDiscountFor(row.product)}
                                className={styles.iconButton}
                                title={`Set a new discount for ${row.product}`}
                                aria-label={`Set a new discount for ${row.product}`}
                              >
                                <EditIcon />
                              </button>
                              <button
                                type="button"
                                onClick={() => setHistoryFor(row.product)}
                                className={styles.iconButton}
                                title={`Discount history for ${row.product}`}
                                aria-label={`Discount history for ${row.product}`}
                              >
                                <HistoryIcon />
                              </button>
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
      {discountFor && selected && (
        <SetDiscountModal
          customerName={selected.customerName}
          product={discountFor}
          currentDiscount={openRow(discountFor)?.discountPerUnit || 0}
          onSubmit={(rate) => onSetDiscount(selectedId, discountFor, rate)}
          onClose={() => setDiscountFor(null)}
        />
      )}

      {historyFor && selected && (
        <DiscountHistoryModal
          customerName={selected.customerName}
          product={historyFor}
          history={openRow(historyFor)?.discountHistory || []}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}
