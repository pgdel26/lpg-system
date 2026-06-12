import { useState } from "react";
import { fmt, today } from "../../lib/utils";
import { DownloadIcon, EditIcon, TrashIcon, XIcon } from "../../components/Icons";
import ExpenseModal from "../../components/ExpenseModal";
import type { SaleTransaction, Swap, Refund, Expense, Staff } from "../../lib/types";
import type { EditData, PendingDelete, DailyReportWithCash, UpdateExpenseFn } from "./transactionsTypes";
import styles from "./SalesReportTab.module.css";

interface SalesReportTabProps {
  inventoryDate: string;
  setInventoryDate: (v: string) => void;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  expenses: Expense[];
  staff: Staff[];
  dailyReport: DailyReportWithCash;
  arTransactions: SaleTransaction[];
  onUpdateDailyStaff: (data: DailyReportWithCash) => Promise<void>;
  onAddExpense: (description: string, amount: string | number) => Promise<void>;
  onUpdateExpense: UpdateExpenseFn;
  onExportFullReport: () => void;
  // Shared inline-edit state (owned by parent; reused by sales tab too)
  editingId: string | null;
  editData: EditData | null;
  setEditData: React.Dispatch<React.SetStateAction<EditData | null>>;
  setEditingId: (id: string | null) => void;
  cancelEdit: () => void;
  setPendingDelete: (d: PendingDelete | null) => void;
}

export default function SalesReportTab({
  inventoryDate, setInventoryDate,
  saleTransactions, swaps, refunds, expenses, staff,
  dailyReport, arTransactions,
  onUpdateDailyStaff, onAddExpense, onUpdateExpense,
  onExportFullReport,
  editingId, editData, setEditData, setEditingId, cancelEdit, setPendingDelete,
}: SalesReportTabProps) {
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);

  const grossSales = saleTransactions.reduce((sum, t) => sum + ((t.srp || 0) * (t.quantity || 1)), 0)
    + swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDiscount = saleTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
  const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalRefunds = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const netSales = grossSales - totalDiscount - totalExpenses - totalRefunds;
  const totalAR = saleTransactions.filter((t) => t.paymentType === "ar").reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
  const totalGCash = saleTransactions.filter((t) => t.paymentType === "gcash").reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
  const collectionsForDay = (arTransactions || []).filter((t) => t.arCollected && t.collectedDate === inventoryDate && t.collectionMethod !== "check");
  const totalCollections = collectionsForDay.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
  const expectedCashRemit = netSales - totalAR - totalGCash + totalCollections;

  return (
    <div>
      {/* Date selector */}
      <div className={styles.dateBar}>
        <input
          type="date"
          value={inventoryDate}
          onChange={(e) => setInventoryDate(e.target.value)}
          className={styles.dateInput}
        />
        {inventoryDate !== today() && (
          <button onClick={() => setInventoryDate(today())} className={styles.todayButton}>
            Go to Today
          </button>
        )}
        <button onClick={onExportFullReport} className={styles.exportButton}>
          <DownloadIcon /> Export
        </button>
      </div>

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

            {/* Discount row */}
            <div className={styles.breakdownRow}>
              <div>
                <div className={styles.rowLabel}>Discounts</div>
                <div className={styles.rowSub}>
                  {saleTransactions.filter((t) => t.discount > 0).length} discounted sale{saleTransactions.filter((t) => t.discount > 0).length !== 1 ? "s" : ""}
                </div>
              </div>
              <span className={`${styles.rowValue} ${totalDiscount > 0 ? styles.valueRed : styles.valueDim}`}>
                {totalDiscount > 0 ? `- ${fmt(totalDiscount)}` : fmt(0)}
              </span>
            </div>

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
            <div className={styles.subTotalRow}>
              <div>
                <div className={styles.rowLabel}>Accounts Receivable</div>
                <div className={styles.rowSub}>
                  {saleTransactions.filter((t) => t.paymentType === "ar").length} AR sale{saleTransactions.filter((t) => t.paymentType === "ar").length !== 1 ? "s" : ""}
                </div>
              </div>
              <span className={`${styles.rowValue} ${totalAR > 0 ? styles.valueOrange : styles.valueDim}`}>
                {totalAR > 0 ? `- ${fmt(totalAR)}` : fmt(0)}
              </span>
            </div>

            {/* GCash row */}
            <div className={styles.subTotalRow}>
              <div>
                <div className={styles.rowLabel}>GCash</div>
                <div className={styles.rowSub}>
                  {saleTransactions.filter((t) => t.paymentType === "gcash").length} GCash sale{saleTransactions.filter((t) => t.paymentType === "gcash").length !== 1 ? "s" : ""}
                </div>
              </div>
              <span className={`${styles.rowValue} ${totalGCash > 0 ? styles.valueBlue : styles.valueDim}`}>
                {totalGCash > 0 ? `- ${fmt(totalGCash)}` : fmt(0)}
              </span>
            </div>

            {/* Collections row */}
            <div className={styles.subTotalRow}>
              <div>
                <div className={styles.rowLabel}>Collections</div>
                <div className={styles.rowSub}>{collectionsForDay.length} AR collected</div>
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

                return (
                  <div key={e.id} className={styles.expenseRow}>
                    <div className={styles.expenseRowInner}>
                      <span className={styles.expenseDesc}>{e.description}</span>
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
          onSubmit={onAddExpense}
          onClose={() => setExpenseModalOpen(false)}
        />
      )}
    </div>
  );
}
