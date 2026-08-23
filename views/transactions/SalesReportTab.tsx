import { useState } from "react";
import { fmt } from "../../lib/utils";
import { paymentSplit } from "../../lib/payments";
import { collectionEventsOnDate, arStatusAsOf } from "../../lib/receivables";
import { groupDiscountsByCustomer, groupARByCustomer, groupGCashByCustomer } from "../../lib/reports/incomeStatement";
import { EditIcon, TrashIcon, XIcon, ChevronDownIcon } from "../../components/Icons";
import ExpenseModal, { type ExpenseSubmission } from "../../components/ExpenseModal";
import { expenseRowLabels } from "../../lib/expenses";
import type { SaleTransaction, Swap, Refund, Expense, Staff } from "../../lib/types";
import type { EditData, PendingDelete, DailyReportWithCash, UpdateExpenseFn } from "./transactionsTypes";
import styles from "./SalesReportTab.module.css";

interface SalesReportTabProps {
  inventoryDate: string;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  expenses: Expense[];
  staff: Staff[];
  dailyReport: DailyReportWithCash;
  arTransactions: SaleTransaction[];
  branch: string;
  onUpdateDailyStaff: (data: DailyReportWithCash) => Promise<void>;
  onAddExpense: (input: ExpenseSubmission) => Promise<void>;
  onUpdateExpense: UpdateExpenseFn;
  // Shared inline-edit state (owned by parent; reused by sales tab too)
  editingId: string | null;
  editData: EditData | null;
  setEditData: React.Dispatch<React.SetStateAction<EditData | null>>;
  setEditingId: (id: string | null) => void;
  cancelEdit: () => void;
  setPendingDelete: (d: PendingDelete | null) => void;
}

export default function SalesReportTab({
  inventoryDate,
  saleTransactions, swaps, refunds, expenses, staff,
  dailyReport, arTransactions, branch,
  onUpdateDailyStaff, onAddExpense, onUpdateExpense,
  editingId, editData, setEditData, setEditingId, cancelEdit, setPendingDelete,
}: SalesReportTabProps) {
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [discountBreakdownOpen, setDiscountBreakdownOpen] = useState(true);
  // All three itemized panels default open, matching Discounts — the breakdown
  // is the point of the row, so it should be visible without a click.
  const [arBreakdownOpen, setArBreakdownOpen] = useState(true);
  const [gcashBreakdownOpen, setGcashBreakdownOpen] = useState(true);

  const grossSales = saleTransactions.reduce((sum, t) => sum + ((t.srp || 0) * (t.quantity || 1)), 0)
    + swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDelivery = saleTransactions.reduce((sum, t) => sum + (t.deliveryCharge || 0), 0);
  const totalDiscount = saleTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
  const discountByCustomer = groupDiscountsByCustomer(saleTransactions);
  const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalRefunds = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const netSales = grossSales + totalDelivery - totalDiscount - totalExpenses - totalRefunds;
  // paymentSplit() is the one shared implementation of the channel rule
  // (also used by DailySalesTab.tsx, salesReport.ts, ReceivablesPage.tsx,
  // TopDebtorsChart.tsx) — summing across all docs correctly attributes a
  // split-payment sale's cash/gcash/ar portions instead of one channel only.
  const totalAR = saleTransactions.reduce((sum, t) => sum + paymentSplit(t).ar, 0);
  const totalGCash = saleTransactions.reduce((sum, t) => sum + paymentSplit(t).gcash, 0);
  const arByCustomer = groupARByCustomer(saleTransactions);
  const gcashByCustomer = groupGCashByCustomer(saleTransactions);
  // Only cash collected at THIS branch, on this date, counts — a doc can
  // receive partial collections across several dates/branches, and check/
  // GCash collections never touch the physical drawer. See lib/receivables.ts.
  // Derived from one shared call so the peso figure and the invoice count
  // below can never drift apart by re-encoding the same predicate twice.
  const collectionsToday = collectionEventsOnDate(arTransactions || [], inventoryDate, branch);
  const totalCollections = collectionsToday.reduce((sum, { event }) => sum + (event.amount || 0), 0);
  const docsCollectedToday = Array.from(new Map(collectionsToday.map(({ doc }) => [doc.id, doc])).values());
  // Status as of THIS date, not live — a doc later fully settled on some
  // future date must not retroactively change what a past day's report says
  // happened that day.
  const partialCollectionsCount = docsCollectedToday.filter((t) => arStatusAsOf(t, inventoryDate).status === "partial").length;
  const expectedCashRemit = netSales - totalAR - totalGCash + totalCollections;

  return (
    <div>
      {/* Date filter and Export live in the outlet page's shared header — both
          applied to every tab, not just this one. */}

      <div className={styles.layout}>
        {/* Left: Report summary */}
        <div className={styles.leftCol}>
          {/* Breakdown table */}
          <div className={styles.breakdownCard}>
            <div className={styles.breakdownTitle}>Daily Breakdown</div>

            {/* Gross Sales row */}
            <div className={styles.breakdownRow}>
              <div>
                <div className={styles.rowLabel}>Gross Sales</div>
                <div className={styles.rowSub}>
                  {saleTransactions.length} sale{saleTransactions.length !== 1 ? "s" : ""} + {swaps.length} swap{swaps.length !== 1 ? "s" : ""}
                </div>
              </div>
              <span className={`${styles.rowValue} ${styles.valueGreen}`}>{fmt(grossSales)}</span>
            </div>

            {/* Delivery Charge row */}
            <div className={styles.breakdownRow}>
              <div>
                <div className={styles.rowLabel}>Delivery Charge</div>
                <div className={styles.rowSub}>
                  {saleTransactions.filter((t) => t.deliveryCharge > 0).length} delivery{saleTransactions.filter((t) => t.deliveryCharge > 0).length !== 1 ? " sales" : " sale"}
                </div>
              </div>
              <span className={`${styles.rowValue} ${totalDelivery > 0 ? styles.valueGreen : styles.valueDim}`}>
                {totalDelivery > 0 ? `+ ${fmt(totalDelivery)}` : fmt(0)}
              </span>
            </div>

            {/* Discount row */}
            <button
              type="button"
              onClick={() => setDiscountBreakdownOpen((v) => !v)}
              aria-expanded={discountBreakdownOpen}
              disabled={discountByCustomer.length === 0}
              className={styles.breakdownRowButton}
            >
              <div>
                <div className={styles.rowLabel}>Discounts</div>
                <div className={styles.rowSub}>
                  {saleTransactions.filter((t) => t.discount > 0).length} discounted sale{saleTransactions.filter((t) => t.discount > 0).length !== 1 ? "s" : ""}
                </div>
              </div>
              <div className={styles.rowValueGroup}>
                <span className={`${styles.rowValue} ${totalDiscount > 0 ? styles.valueRed : styles.valueDim}`}>
                  {totalDiscount > 0 ? `- ${fmt(totalDiscount)}` : fmt(0)}
                </span>
                {discountByCustomer.length > 0 && (
                  <span className={`${styles.rowChevron} ${discountBreakdownOpen ? "" : styles.closed}`}>
                    <ChevronDownIcon />
                  </span>
                )}
              </div>
            </button>

            {/* Per-customer discount breakdown */}
            {discountBreakdownOpen && discountByCustomer.length > 0 && (
              <div className={`${styles.itemBreakdown} ${styles.tintRed}`}>
                {discountByCustomer.map((d) => (
                  <div key={d.label} className={styles.itemBreakdownRow}>
                    <span className={styles.itemCustomerName}>{d.label}</span>
                    <span className={`${styles.itemCustomerAmount} ${styles.valueRed}`}>- {fmt(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Expenses row */}
            <div className={styles.breakdownRow}>
              <div>
                <div className={styles.rowLabel}>Expenses</div>
                <div className={styles.rowSub}>
                  {(expenses || []).length} expense{(expenses || []).length !== 1 ? "s" : ""}
                </div>
              </div>
              <span className={`${styles.rowValue} ${totalExpenses > 0 ? styles.valueRed : styles.valueDim}`}>
                {totalExpenses > 0 ? `- ${fmt(totalExpenses)}` : fmt(0)}
              </span>
            </div>

            {/* Refunds row */}
            <div className={styles.breakdownRow}>
              <div>
                <div className={styles.rowLabel}>Refunds</div>
                <div className={styles.rowSub}>
                  {(refunds || []).length} refund{(refunds || []).length !== 1 ? "s" : ""}
                </div>
              </div>
              <span className={`${styles.rowValue} ${totalRefunds > 0 ? styles.valueRed : styles.valueDim}`}>
                {totalRefunds > 0 ? `- ${fmt(totalRefunds)}` : fmt(0)}
              </span>
            </div>

            {/* Net Sales total */}
            <div className={styles.netSalesRow}>
              <span className={styles.totalLabel}>Net Sales</span>
              <span className={`${styles.totalValue} ${netSales >= 0 ? styles.valueGold : styles.valueRed}`}>
                {fmt(netSales)}
              </span>
            </div>

            {/* Accounts Receivable row */}
            <button
              type="button"
              onClick={() => setArBreakdownOpen((v) => !v)}
              aria-expanded={arBreakdownOpen}
              disabled={arByCustomer.length === 0}
              className={styles.subTotalRowButton}
            >
              <div>
                <div className={styles.rowLabel}>Accounts Receivable</div>
                <div className={styles.rowSub}>
                  {/* Count docs with a non-zero AR allocation, not paymentType==="ar" —
                      a split sale's AR portion must still show up in this count. */}
                  {saleTransactions.filter((t) => paymentSplit(t).ar > 0).length} AR sale{saleTransactions.filter((t) => paymentSplit(t).ar > 0).length !== 1 ? "s" : ""} — new credit today, before collections
                </div>
              </div>
              <div className={styles.rowValueGroup}>
                <span className={`${styles.rowValue} ${totalAR > 0 ? styles.valueOrange : styles.valueDim}`}>
                  {totalAR > 0 ? `- ${fmt(totalAR)}` : fmt(0)}
                </span>
                {arByCustomer.length > 0 && (
                  <span className={`${styles.rowChevron} ${arBreakdownOpen ? "" : styles.closed}`}>
                    <ChevronDownIcon />
                  </span>
                )}
              </div>
            </button>

            {/* Per-customer A/R breakdown */}
            {arBreakdownOpen && arByCustomer.length > 0 && (
              <div className={`${styles.itemBreakdown} ${styles.tintOrange} ${styles.flushNext}`}>
                {arByCustomer.map((d) => (
                  <div key={d.label} className={styles.itemBreakdownRow}>
                    <span className={styles.itemCustomerName}>{d.label}</span>
                    <span className={`${styles.itemCustomerAmount} ${styles.valueOrange}`}>- {fmt(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* GCash row */}
            <button
              type="button"
              onClick={() => setGcashBreakdownOpen((v) => !v)}
              aria-expanded={gcashBreakdownOpen}
              disabled={gcashByCustomer.length === 0}
              className={styles.subTotalRowButton}
            >
              <div>
                <div className={styles.rowLabel}>GCash</div>
                <div className={styles.rowSub}>
                  {saleTransactions.filter((t) => paymentSplit(t).gcash > 0).length} GCash sale{saleTransactions.filter((t) => paymentSplit(t).gcash > 0).length !== 1 ? "s" : ""}
                </div>
              </div>
              <div className={styles.rowValueGroup}>
                <span className={`${styles.rowValue} ${totalGCash > 0 ? styles.valueBlue : styles.valueDim}`}>
                  {totalGCash > 0 ? `- ${fmt(totalGCash)}` : fmt(0)}
                </span>
                {gcashByCustomer.length > 0 && (
                  <span className={`${styles.rowChevron} ${gcashBreakdownOpen ? "" : styles.closed}`}>
                    <ChevronDownIcon />
                  </span>
                )}
              </div>
            </button>

            {/* Per-customer GCash breakdown */}
            {gcashBreakdownOpen && gcashByCustomer.length > 0 && (
              <div className={`${styles.itemBreakdown} ${styles.tintBlue} ${styles.flushNext}`}>
                {gcashByCustomer.map((d) => (
                  <div key={d.label} className={styles.itemBreakdownRow}>
                    <span className={styles.itemCustomerName}>{d.label}</span>
                    <span className={`${styles.itemCustomerAmount} ${styles.valueBlue}`}>- {fmt(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Collections row */}
            <div className={styles.subTotalRow}>
              <div>
                <div className={styles.rowLabel}>Collections</div>
                <div className={styles.rowSub}>
                  {docsCollectedToday.length} invoice{docsCollectedToday.length !== 1 ? "s" : ""}{partialCollectionsCount > 0 ? ` (${partialCollectionsCount} partial)` : ""}
                </div>
              </div>
              <span className={`${styles.rowValue} ${totalCollections > 0 ? styles.valueGreen : styles.valueDim}`}>
                {totalCollections > 0 ? `+ ${fmt(totalCollections)}` : fmt(0)}
              </span>
            </div>

            {/* Expected Cash Remit */}
            <div className={styles.remitRow}>
              <span className={styles.totalLabel}>Expected Cash Remit</span>
              <span className={`${styles.totalValue} ${expectedCashRemit >= 0 ? styles.valueGreen : styles.valueRed}`}>
                {fmt(expectedCashRemit)}
              </span>
            </div>

            {/* Cash On Hand */}
            <div className={styles.cashOnHandRow}>
              <span className={styles.totalLabel}>Cash On Hand</span>
              <input
                type="number"
                value={dailyReport?.actualCashRemit ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateDailyStaff({ ...dailyReport, actualCashRemit: val === "" ? null : parseFloat(val) });
                }}
                placeholder="0"
                className={styles.cashInput}
              />
            </div>

            {/* Short / Over — only show when Cash On Hand has a value */}
            {dailyReport?.actualCashRemit != null && dailyReport?.actualCashRemit !== "" && (() => {
              const actual = parseFloat(String(dailyReport.actualCashRemit)) || 0;
              const diff = actual - expectedCashRemit;
              const isOver = diff > 0;
              const isShort = diff < 0;
              return (
                <div className={`${styles.shortOverRow} ${isShort ? styles.shortBg : isOver ? styles.overBg : styles.neutralBg}`}>
                  <span className={styles.totalLabel}>
                    {isShort ? "Short" : isOver ? "Over" : "Short / Over"}
                  </span>
                  <span className={`${styles.totalValue} ${isShort ? styles.valueRed : isOver ? styles.valueGreen : styles.valueDim}`}>
                    {isShort ? `- ${fmt(Math.abs(diff))}` : isOver ? `+ ${fmt(diff)}` : fmt(0)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Right: Staff + Expenses panels */}
        <div className={styles.rightCol}>
          {/* Staff on Duty */}
          <div className={styles.staffSection}>
            <div className={styles.sectionHeading}>
              <div className={`${styles.dot} ${styles.dotBlue}`} />
              <h3 className={styles.sectionTitle}>Staff on Duty</h3>
            </div>

            <div className={styles.staffCard}>
              {/* Cashier */}
              <div className={styles.cashierBlock}>
                <span className={styles.fieldLabel}>Cashier</span>
                <select
                  value={dailyReport?.cashier || ""}
                  onChange={(e) => onUpdateDailyStaff({ ...dailyReport, cashier: e.target.value || null })}
                  className={styles.staffSelect}
                >
                  <option value="">-- Select cashier --</option>
                  {(staff || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ""}</option>
                  ))}
                </select>
              </div>

              {/* Staff */}
              <div>
                <span className={styles.fieldLabel}>Staff</span>
                {/* Assigned staff list */}
                <div className={styles.staffList}>
                  {(dailyReport?.staff || []).map((id) => {
                    const s = (staff || []).find((st) => st.id === id);
                    if (!s) return null;
                    return (
                      <div key={s.id} className={styles.staffItem}>
                        <div>
                          <span className={styles.staffName}>{s.name}</span>
                          {s.role && <span className={styles.staffRole}>({s.role})</span>}
                        </div>
                        <button
                          onClick={() => {
                            const updated = (dailyReport?.staff || []).filter((sid) => sid !== s.id);
                            onUpdateDailyStaff({ ...dailyReport, staff: updated });
                          }}
                          className={styles.staffRemove}
                          title="Remove"
                        >
                          <XIcon />
                        </button>
                      </div>
                    );
                  })}
                  {(dailyReport?.staff || []).length === 0 && (
                    <div className={styles.staffEmpty}>No staff assigned.</div>
                  )}
                </div>

                {/* Add staff dropdown */}
                {(() => {
                  const assignedIds = dailyReport?.staff || [];
                  const available = (staff || []).filter((s) => !assignedIds.includes(s.id));
                  return (
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        onUpdateDailyStaff({ ...dailyReport, staff: [...assignedIds, e.target.value] });
                      }}
                      disabled={available.length === 0}
                      className={`${styles.addStaffSelect} ${available.length === 0 ? styles.addStaffDisabled : ""}`}
                    >
                      <option value="">{available.length === 0 ? "All staff assigned" : "+ Add staff..."}</option>
                      {available.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ""}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div>
            <div className={styles.expenseHeading}>
              <div className={styles.sectionHeadingInner}>
                <div className={`${styles.dot} ${styles.dotOrange}`} />
                <h3 className={styles.sectionTitle}>Expenses</h3>
              </div>
              <button onClick={() => setExpenseModalOpen(true)} className={styles.expenseNewButton}>
                New
              </button>
            </div>

            <div className={styles.expenseCard}>
              {(expenses || []).length > 0 ? (expenses || []).map((e) => {
                const isEditing = editingId === `expense_${e.id}`;

                if (isEditing && editData && editData.type === "expense") {
                  return (
                    <div key={e.id} className={styles.expenseEditRow}>
                      <div className={styles.expenseEditFields}>
                        <div className={styles.expenseEditDesc}>
                          <span className={styles.editFieldLabel}>Description</span>
                          <input
                            value={editData.description}
                            onChange={(ev) => setEditData((p) => (p && p.type === "expense" ? { ...p, description: ev.target.value } : p))}
                            className={`${styles.editInput} ${styles.editInputFull}`}
                          />
                        </div>
                        <div>
                          <span className={styles.editFieldLabel}>Amount</span>
                          <input
                            type="number"
                            value={editData.amount}
                            onChange={(ev) => setEditData((p) => (p && p.type === "expense" ? { ...p, amount: ev.target.value } : p))}
                            className={`${styles.editInput} ${styles.editInputAmount} ${styles.editInputMono}`}
                          />
                        </div>
                      </div>
                      <div className={styles.expenseEditActions}>
                        <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                        <button onClick={() => { onUpdateExpense(editData.id, editData); cancelEdit(); }} className={styles.saveButton}>Save</button>
                      </div>
                    </div>
                  );
                }

                // Resolved from the roster on every render on purpose: renaming
                // a staff member re-labels their historical salary rows.
                const labels = expenseRowLabels(e, staff);

                return (
                  <div key={e.id} className={styles.expenseRow}>
                    <div className={styles.expenseRowInner}>
                      <div className={styles.expenseDescWrap}>
                        <span className={styles.expenseDesc}>{labels.primary}</span>
                        <span className={styles.expenseCategory}>{labels.category}</span>
                      </div>
                      <div className={styles.expenseRowRight}>
                        <span className={styles.expenseAmount}>{fmt(e.amount)}</span>
                        <button
                          onClick={() => { setEditingId(`expense_${e.id}`); setEditData({ type: "expense", id: e.id, description: e.description, amount: e.amount }); }}
                          className={styles.iconButton}
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button onClick={() => setPendingDelete({ type: "expense", id: e.id })} className={styles.iconButton} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className={styles.expenseEmpty}>No expenses recorded today.</div>
              )}
              {(expenses || []).length > 0 && (
                <div className={styles.expenseTotalRow}>
                  <span className={styles.expenseTotalLabel}>Total</span>
                  <span className={styles.expenseTotalValue}>{fmt(totalExpenses)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {expenseModalOpen && (
        <ExpenseModal
          staff={staff}
          onSubmit={onAddExpense}
          onClose={() => setExpenseModalOpen(false)}
        />
      )}
    </div>
  );
}
