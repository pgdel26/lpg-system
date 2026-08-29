import { fmt, saleSectionLabel } from "../../lib/utils";
import { EditIcon, TrashIcon } from "../../components/Icons";
import { paymentSplit } from "../../lib/payments";
import { arStatus } from "../../lib/receivables";
import type { SaleTransaction, Swap, Refund } from "../../lib/types";
import type { EditData, PendingDelete } from "./transactionsTypes";
import styles from "./DailySalesTab.module.css";

interface DailySalesTabProps {
  sorted: SaleTransaction[];
  /**
   * Swap and refund money for the day. The rows themselves live on the Other
   * Transactions tab now, but these two still belong here: the Cash column below
   * is money-by-channel, so it folds swap cash in and nets refunds out — the
   * same rule salesReport.ts and SalesReportTab apply. Dropping them would make
   * this table's Cash total disagree with the Sales Report's.
   */
  swapTotal: number;
  refundTotal: number;

  // Shared inline-edit state (owned by parent)
  editingId: string | null;
  editData: EditData | null;
  setEditData: React.Dispatch<React.SetStateAction<EditData | null>>;
  startEdit: (type: "sale" | "swap" | "refund", item: SaleTransaction | Swap | Refund) => void;
  cancelEdit: () => void;
  saveEdit: () => Promise<void> | void;
  setPendingDelete: (d: PendingDelete | null) => void;
}

// Columns: # | Invoice | Customer | Product | Type | Qty | SRP | Disc. | Delivery | Tax | Cash | GCash | A/R | GCash Ref | actions
const SALE_GRID = "36px 0.7fr 1.2fr 1.2fr 0.6fr 0.5fr 0.8fr 0.7fr 0.7fr 0.7fr 0.8fr 0.8fr 0.8fr 1fr 52px";

export default function DailySalesTab({
  sorted,
  swapTotal, refundTotal,
  editingId, editData, setEditData, startEdit, cancelEdit, saveEdit, setPendingDelete,
}: DailySalesTabProps) {
  // Money-by-channel: swaps come in as cash, refunds are cash paid out. Folding
  // both into the Cash column makes Cash + GCash + A/R reconcile to the grand total.
  // paymentSplit() is the one shared implementation of this rule (also used by
  // salesReport.ts, SalesReportTab.tsx, ReceivablesPage.tsx, TopDebtorsChart.tsx) —
  // a split sale can populate more than one of Cash/GCash/A/R for the same row.
  const cashTotal = sorted.reduce((s, t) => s + paymentSplit(t).cash, 0) + swapTotal - refundTotal;
  const gcashTotal = sorted.reduce((s, t) => s + paymentSplit(t).gcash, 0);
  const arTotal = sorted.reduce((s, t) => s + paymentSplit(t).ar, 0);
  // Sits INSIDE the three above, not beside them: tax is charged on top of the
  // sale and paid with it, so it is already in whichever channel settled the
  // invoice. Shown so the day's tax is readable, never added to the total.
  const taxTotal = sorted.reduce((s, t) => s + (t.tax || 0), 0);

  return (
    <div>
      {/* This tab has no toolbar of its own any more. The date filter, Export,
          Add Sale and Add AR Collection all live in the outlet page's shared
          header — every one of them applied to more than just this tab. The
          New buttons on the swap and refund panels below stay local: they add
          to those panels specifically. */}

      {/* Full width now that the swap/refund/collection panels have their own
          tab — the sales table has fifteen columns and wants every pixel. */}
      <div className={styles.tableCol}>
        <h3 className={styles.tableHeading}>Sales</h3>
        <div className={`${styles.card} ${styles.tableCard}`}>
          <div className={styles.tableInner}>
          <div className={styles.tableHeader} style={{ gridTemplateColumns: SALE_GRID }}>
            <span>#</span>
            <span>Invoice</span>
            <span>Customer</span>
            <span>Product</span>
            <span>Type</span>
            <span className={styles.alignCenter}>Qty</span>
            <span className={styles.alignRight}>SRP</span>
            <span className={styles.alignRight}>Disc.</span>
            <span className={styles.alignRight}>Delivery</span>
            <span className={styles.alignRight}>Tax</span>
            <span className={styles.alignRight}>Cash</span>
            <span className={styles.alignRight}>GCash</span>
            <span className={styles.alignRight}>A/R</span>
            <span className={styles.refCol}>GCash Ref No</span>
            <span />
          </div>

          <div className={styles.tableBody}>
          {sorted.length > 0 ? sorted.map((t, i) => {
            const isEditing = editingId === `sale_${t.id}`;

            if (isEditing && editData && editData.type === "sale") {
              return (
                <div key={t.id} className={styles.editRow}>
                  <div className={styles.editFields}>
                    <div>
                      <span className={styles.editFieldLabel}>Invoice</span>
                      <input value={editData.invoice} onChange={(e) => setEditData((p) => (p && p.type === "sale" ? { ...p, invoice: e.target.value } : p))}
                        className={`${styles.editInput} ${styles.editInputInvoice}`} />
                    </div>
                    <div>
                      <span className={styles.editFieldLabel}>Customer</span>
                      <input value={editData.customerName} onChange={(e) => setEditData((p) => (p && p.type === "sale" ? { ...p, customerName: e.target.value } : p))}
                        className={`${styles.editInput} ${styles.editInputCustomer}`} />
                    </div>
                    <div>
                      <span className={styles.editFieldLabel}>Discount</span>
                      <input type="number" value={editData.discount} onChange={(e) => {
                        const disc = parseFloat(e.target.value) || 0;
                        // Must include deliveryCharge AND tax — both are already
                        // baked into the doc's totalAmount, and dropping either
                        // here would understate totalAmount without touching the
                        // doc's own deliveryCharge/tax fields, silently desyncing
                        // them. This is the same formula as useSalesData's line
                        // computation; the two have to stay identical.
                        setEditData((p) => (p && p.type === "sale" ? { ...p, discount: disc, totalAmount: Math.max(0, (p.srp * p.quantity) - disc + p.deliveryCharge + p.tax) } : p));
                      }} className={`${styles.editInput} ${styles.editInputDiscount} ${styles.editInputMono}`} />
                    </div>
                    <div>
                      <span className={styles.editFieldLabel}>Payment</span>
                      <select value={editData.paymentType} onChange={(e) => setEditData((p) => (p && p.type === "sale" ? { ...p, paymentType: e.target.value } : p))}
                        className={`${styles.editInput} ${styles.editSelect}`}>
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                        <option value="ar">AR</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.editFooter}>
                    <span className={styles.editTotal}>Total: {fmt(editData.totalAmount)}</span>
                    <div className={styles.editActions}>
                      <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                      <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                    </div>
                  </div>
                </div>
              );
            }

            const split = paymentSplit(t);
            // A sale with a `payments` array can't be safely inline-edited —
            // changing discount/total/paymentType would desync it from the
            // per-row payment allocation. Delete and re-record instead.
            const isSplitPayment = !!t.payments;
            // An AR sale with a recorded collection can't be edited/deleted
            // either — that would desync arCollections from the invoice
            // total, or silently remove cash that already fed a past day's
            // Expected Cash Remit. Same guard as the Receivables page.
            const hasCollections = arStatus(t).collected > 0;

            return (
              <div key={t.id} className={styles.saleRow} style={{ gridTemplateColumns: SALE_GRID }}>
                <span className={styles.indexCell}>{i + 1}</span>
                <span className={styles.invoiceCell}>{t.invoice || "—"}</span>
                <span className={styles.secondaryCell}>{t.customerName || "—"}</span>
                <span className={styles.productCell}>{t.product}</span>
                <span className={styles.typeCell}>{saleSectionLabel(t.saleSection)}</span>
                <span className={styles.qtyCell}>{t.quantity || 1}</span>
                <span className={styles.srpCell}>{fmt(t.srp || 0)}</span>
                <span className={`${styles.discCell} ${t.discount > 0 ? styles.discActive : styles.discDim}`}>
                  {t.discount > 0 ? `-${fmt(t.discount)}` : "—"}
                </span>
                <span className={`${styles.discCell} ${t.deliveryCharge > 0 ? styles.deliveryActive : styles.discDim}`}>
                  {t.deliveryCharge > 0 ? `+${fmt(t.deliveryCharge)}` : "—"}
                </span>
                {/* Signed "+" like Delivery, because it too is already inside
                    the Cash/GCash/A-R figures to its right — part of what was
                    charged, not a separate collection. */}
                <span className={`${styles.discCell} ${(t.tax || 0) > 0 ? styles.deliveryActive : styles.discDim}`}>
                  {(t.tax || 0) > 0 ? `+${fmt(t.tax || 0)}` : "—"}
                </span>
                <span className={split.cash > 0 ? `${styles.amountCell} ${styles.amountCash}` : styles.amountOff}>
                  {split.cash > 0 ? fmt(split.cash) : "—"}
                </span>
                <span className={split.gcash > 0 ? `${styles.amountCell} ${styles.amountGcash}` : styles.amountOff}>
                  {split.gcash > 0 ? fmt(split.gcash) : "—"}
                </span>
                <span className={split.ar > 0 ? `${styles.amountCell} ${styles.amountAr}` : styles.amountOff}>
                  {split.ar > 0 ? fmt(split.ar) : "—"}
                </span>
                <span className={`${styles.gcashCell} ${styles.refCol} ${t.gcashRef ? styles.gcashOn : styles.gcashOff}`}>
                  {t.gcashRef || "—"}
                </span>
                <div className={styles.rowActions}>
                  {isSplitPayment || hasCollections ? (
                    <button
                      disabled
                      className={`${styles.iconButton} ${styles.iconButtonDisabled}`}
                      title={hasCollections ? "Has collections — void them on the Receivables page first" : "Split payment — delete and re-record to change"}
                    >
                      <EditIcon />
                    </button>
                  ) : (
                    <button onClick={() => startEdit("sale", t)} className={styles.iconButton} title="Edit">
                      <EditIcon />
                    </button>
                  )}
                  <button
                    onClick={() => setPendingDelete({ type: "sale", id: t.id })}
                    disabled={hasCollections}
                    className={`${styles.iconButton} ${hasCollections ? styles.iconButtonDisabled : ""}`}
                    title={hasCollections ? "Has collections — void them on the Receivables page first" : "Delete"}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          }) : (
            <div className={styles.emptyRow}>No sales transactions recorded today.</div>
          )}
          </div>

          {sorted.length > 0 && (
            <div className={styles.totalRow} style={{ gridTemplateColumns: SALE_GRID }}>
              <span /><span /><span /><span /><span /><span /><span />
              <span className={styles.totalRowLabel}>Total</span>
              <span />
              {/* Tax column: totalled, because a day's tax is a figure worth
                  reading, and an empty cell under a column of numbers reads as
                  an oversight. */}
              <span className={`${styles.totalRowValue} ${styles.deliveryActive}`}>{fmt(taxTotal)}</span>
              <span className={`${styles.totalRowValue} ${styles.amountCash}`}>{fmt(cashTotal)}</span>
              <span className={`${styles.totalRowValue} ${styles.amountGcash}`}>{fmt(gcashTotal)}</span>
              <span className={`${styles.totalRowValue} ${styles.amountAr}`}>{fmt(arTotal)}</span>
              <span /><span />
            </div>
          )}
          {/* NOT gated on there being sales. A day with no sales and one refund
              is a day with a short drawer and an empty table, and since the
              refund row itself moved to Other Transactions there would
              otherwise be nothing on this tab accounting for the money out. */}
          {(swapTotal > 0 || refundTotal > 0) && (
            <div className={styles.cashAdjustNote}>
              Cash includes
              {swapTotal > 0 ? ` +${fmt(swapTotal)} swaps` : ""}
              {swapTotal > 0 && refundTotal > 0 ? "," : ""}
              {refundTotal > 0 ? ` −${fmt(refundTotal)} refunds` : ""}
              {" "}— see Other Transactions.
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
