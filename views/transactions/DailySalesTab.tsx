import { useState } from "react";
import { fmt, today } from "../../lib/utils";
import { PlusIcon, EditIcon, TrashIcon, DownloadIcon, ChevronLeftIcon } from "../../components/Icons";
import { paymentSplit } from "../../lib/payments";
import type { SaleTransaction, Swap, Refund } from "../../lib/types";
import type { EditData, PendingDelete } from "./transactionsTypes";
import styles from "./DailySalesTab.module.css";

interface DailySalesTabProps {
  inventoryDate: string;
  setInventoryDate: (v: string) => void;
  sorted: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  swapTotal: number;
  refundTotal: number;
  grandTotal: number;
  saleTypeLabel: (section: string) => string;
  onOpenSaleModal: () => void;
  onOpenSwapModal: () => void;
  onOpenRefundModal: () => void;
  onViewInventory: () => void;
  onExportFullReport: () => void;
  // Shared inline-edit state (owned by parent)
  editingId: string | null;
  editData: EditData | null;
  setEditData: React.Dispatch<React.SetStateAction<EditData | null>>;
  startEdit: (type: "sale" | "swap" | "refund", item: SaleTransaction | Swap | Refund) => void;
  cancelEdit: () => void;
  saveEdit: () => Promise<void> | void;
  setPendingDelete: (d: PendingDelete | null) => void;
}

// Columns: # | Invoice | Customer | Product | Type | Qty | SRP | Disc. | Delivery | Cash | GCash | A/R | GCash Ref | actions
const SALE_GRID = "36px 0.7fr 1.2fr 1.2fr 0.6fr 0.5fr 0.8fr 0.7fr 0.7fr 0.8fr 0.8fr 0.8fr 1fr 52px";

export default function DailySalesTab({
  inventoryDate, setInventoryDate,
  sorted, swaps, refunds,
  swapTotal, refundTotal, grandTotal,
  saleTypeLabel,
  onOpenSaleModal, onOpenSwapModal, onOpenRefundModal,
  onViewInventory, onExportFullReport,
  editingId, editData, setEditData, startEdit, cancelEdit, saveEdit, setPendingDelete,
}: DailySalesTabProps) {
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // Money-by-channel: swaps come in as cash, refunds are cash paid out. Folding
  // both into the Cash column makes Cash + GCash + A/R reconcile to the grand total.
  // paymentSplit() is the one shared implementation of this rule (also used by
  // salesReport.ts, SalesReportTab.tsx, ReceivablesPage.tsx, TopDebtorsChart.tsx) —
  // a split sale can populate more than one of Cash/GCash/A/R for the same row.
  const cashTotal = sorted.reduce((s, t) => s + paymentSplit(t).cash, 0) + swapTotal - refundTotal;
  const gcashTotal = sorted.reduce((s, t) => s + paymentSplit(t).gcash, 0);
  const arTotal = sorted.reduce((s, t) => s + paymentSplit(t).ar, 0);

  return (
    <div>
      {/* Date selector + Record Sale button */}
      <div className={styles.toolbar}>
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
        <div className={styles.toolbarActions}>
          <button onClick={() => onOpenSaleModal()} className={styles.primaryButton}>
            <PlusIcon /> Add Sale
          </button>
          <button onClick={onViewInventory} className={styles.primaryButton}>
            View Inventory
          </button>
          <button
            onClick={onExportFullReport}
            disabled={sorted.length === 0}
            className={`${styles.exportButton} ${sorted.length === 0 ? styles.exportButtonDisabled : ""}`}
          >
            <DownloadIcon /> Export
          </button>
        </div>
      </div>

      {/* Grand total card */}
      <div className={styles.grandTotalCard}>
        <span className={styles.grandTotalLabel}>Total Sales</span>
        <span className={styles.grandTotalValue}>{fmt(grandTotal)}</span>
      </div>

      {/* Main layout: Sales table + side panels */}
      <div className={styles.mainLayout}>
        {/* Sales transactions table */}
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
                          setEditData((p) => (p && p.type === "sale" ? { ...p, discount: disc, totalAmount: Math.max(0, (p.srp * p.quantity) - disc) } : p));
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

              return (
                <div key={t.id} className={styles.saleRow} style={{ gridTemplateColumns: SALE_GRID }}>
                  <span className={styles.indexCell}>{i + 1}</span>
                  <span className={styles.invoiceCell}>{t.invoice || "—"}</span>
                  <span className={styles.secondaryCell}>{t.customerName || "—"}</span>
                  <span className={styles.productCell}>{t.product}</span>
                  <span className={styles.typeCell}>{saleTypeLabel(t.saleSection)}</span>
                  <span className={styles.qtyCell}>{t.quantity || 1}</span>
                  <span className={styles.srpCell}>{fmt(t.srp || 0)}</span>
                  <span className={`${styles.discCell} ${t.discount > 0 ? styles.discActive : styles.discDim}`}>
                    {t.discount > 0 ? `-${fmt(t.discount)}` : "—"}
                  </span>
                  <span className={`${styles.discCell} ${t.deliveryCharge > 0 ? styles.deliveryActive : styles.discDim}`}>
                    {t.deliveryCharge > 0 ? `+${fmt(t.deliveryCharge)}` : "—"}
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
                    {isSplitPayment ? (
                      <button
                        disabled
                        className={styles.iconButton}
                        style={{ opacity: 0.3, cursor: "not-allowed" }}
                        title="Split payment — delete and re-record to change"
                      >
                        <EditIcon />
                      </button>
                    ) : (
                      <button onClick={() => startEdit("sale", t)} className={styles.iconButton} title="Edit">
                        <EditIcon />
                      </button>
                    )}
                    <button onClick={() => setPendingDelete({ type: "sale", id: t.id })} className={styles.iconButton} title="Delete">
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
                <span className={`${styles.totalRowValue} ${styles.amountCash}`}>{fmt(cashTotal)}</span>
                <span className={`${styles.totalRowValue} ${styles.amountGcash}`}>{fmt(gcashTotal)}</span>
                <span className={`${styles.totalRowValue} ${styles.amountAr}`}>{fmt(arTotal)}</span>
                <span /><span />
              </div>
            )}
            {sorted.length > 0 && (swapTotal > 0 || refundTotal > 0) && (
              <div className={styles.cashAdjustNote}>
                Cash includes
                {swapTotal > 0 ? ` +${fmt(swapTotal)} swaps` : ""}
                {swapTotal > 0 && refundTotal > 0 ? "," : ""}
                {refundTotal > 0 ? ` −${fmt(refundTotal)} refunds` : ""}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Side panel toggle + collapsible Swap + Refund */}
        <div className={styles.sidePanelWrap}>
          <button
            onClick={() => setSidePanelOpen((v) => !v)}
            title={sidePanelOpen ? "Collapse panel" : "Expand panel"}
            className={`${styles.toggleButton} ${sidePanelOpen ? styles.toggleOpen : styles.toggleClosed}`}
          >
            <ChevronLeftIcon />
          </button>
          {sidePanelOpen && (
            <div className={styles.sidePanel}>
              {/* Upgrade / Swap section */}
              <div className={styles.panelSection}>
                <div className={styles.panelHeading}>
                  <div className={styles.panelHeadingInner}>
                    <div className={`${styles.dot} ${styles.dotBlue}`} />
                    <h3 className={styles.panelTitle}>Upgrade / Swap</h3>
                  </div>
                  <div className={styles.panelHeadingActions}>
                    <button onClick={onOpenSwapModal} className={styles.swapNewButton}>New</button>
                  </div>
                </div>

                <div className={styles.card}>
                  {swaps.length > 0 ? swaps.map((s) => {
                    const isEditing = editingId === `swap_${s.id}`;

                    if (isEditing && editData && editData.type === "swap") {
                      return (
                        <div key={s.id} className={styles.editRow}>
                          <div className={styles.editFields}>
                            <div>
                              <span className={styles.editFieldLabel}>From</span>
                              <input value={editData.productFrom} onChange={(e) => setEditData((p) => (p && p.type === "swap" ? { ...p, productFrom: e.target.value } : p))}
                                className={`${styles.editInput} ${styles.editInputCustomer}`} />
                            </div>
                            <span className={styles.arrowEdit}>&rarr;</span>
                            <div>
                              <span className={styles.editFieldLabel}>To</span>
                              <input value={editData.productTo} onChange={(e) => setEditData((p) => (p && p.type === "swap" ? { ...p, productTo: e.target.value } : p))}
                                className={`${styles.editInput} ${styles.editInputCustomer}`} />
                            </div>
                            <div>
                              <span className={styles.editFieldLabel}>Price</span>
                              <input type="number" value={editData.price} onChange={(e) => setEditData((p) => (p && p.type === "swap" ? { ...p, price: e.target.value } : p))}
                                className={`${styles.editInput} ${styles.editInputDiscount} ${styles.editInputMono}`} />
                            </div>
                          </div>
                          <div className={styles.editFooterEnd}>
                            <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                            <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={s.id} className={styles.panelRow}>
                        <div className={styles.panelRowInner}>
                          <div className={styles.swapText}>
                            <span className={styles.swapProduct}>{s.productFrom}</span>
                            <span className={styles.swapArrow}>&rarr;</span>
                            <span className={styles.swapProduct}>{s.productTo}</span>
                          </div>
                          <div className={styles.panelRowRight}>
                            <span className={styles.swapPrice}>{fmt(s.price)}</span>
                            <button onClick={() => startEdit("swap", s)} className={styles.iconButton} title="Edit">
                              <EditIcon />
                            </button>
                            <button onClick={() => setPendingDelete({ type: "swap", id: s.id })} className={styles.iconButton} title="Delete">
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className={styles.panelEmpty}>No swaps recorded today.</div>
                  )}
                  {swaps.length > 0 && (
                    <div className={styles.panelTotalRow}>
                      <span className={styles.panelTotalLabel}>Total</span>
                      <span className={styles.panelTotalValue}>{fmt(swapTotal)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Refund / Return section */}
              <div className={styles.panelSection}>
                <div className={styles.panelHeading}>
                  <div className={styles.panelHeadingInner}>
                    <div className={`${styles.dot} ${styles.dotRed}`} />
                    <h3 className={styles.panelTitle}>Refund / Return</h3>
                  </div>
                  <div className={styles.panelHeadingActions}>
                    <button onClick={onOpenRefundModal} className={styles.refundNewButton}>New</button>
                  </div>
                </div>

                <div className={styles.card}>
                  {(refunds || []).length > 0 ? (refunds || []).map((r) => {
                    const isEditing = editingId === `refund_${r.id}`;

                    if (isEditing && editData && editData.type === "refund") {
                      const editTotal = editData.items.reduce((sum, it) => sum + (parseFloat(String(it.value)) || 0), 0);
                      return (
                        <div key={r.id} className={styles.refundEditRow}>
                          <div className={styles.refundEditFields}>
                            <div>
                              <span className={styles.editFieldLabel}>Invoice</span>
                              <input value={editData.invoice} onChange={(e) => setEditData((p) => (p && p.type === "refund" ? { ...p, invoice: e.target.value } : p))}
                                className={`${styles.editInput} ${styles.editInputInvoice}`} />
                            </div>
                            <div>
                              <span className={styles.editFieldLabel}>Customer</span>
                              <input value={editData.customerName} onChange={(e) => setEditData((p) => (p && p.type === "refund" ? { ...p, customerName: e.target.value } : p))}
                                className={`${styles.editInput} ${styles.editInputCustomer}`} />
                            </div>
                            <div>
                              <span className={styles.editFieldLabel}>Reason</span>
                              <input value={editData.reason} onChange={(e) => setEditData((p) => (p && p.type === "refund" ? { ...p, reason: e.target.value } : p))}
                                className={`${styles.editInput} ${styles.editInputReason}`} />
                            </div>
                          </div>
                          {editData.items.map((item, idx) => (
                            <div key={idx} className={styles.refundEditItem}>
                              <span className={styles.refundItemLabel}>
                                {String(item.qty)}&times; {String(item.product)}
                              </span>
                              <div className={styles.refundItemValue}>
                                <span className={styles.pesoSign}>₱</span>
                                <input type="number" value={(item.value as string | number) || ""} onChange={(e) => {
                                  setEditData((prev) => {
                                    if (!prev || prev.type !== "refund") return prev;
                                    const items = [...prev.items];
                                    items[idx] = { ...items[idx], value: e.target.value };
                                    return { ...prev, items };
                                  });
                                }} className={`${styles.editInput} ${styles.editInputValue} ${styles.editInputMono}`} />
                              </div>
                              <label className={styles.defectiveLabel}>
                                <input type="checkbox" checked={(item.defective as boolean) || false} onChange={(e) => {
                                  setEditData((prev) => {
                                    if (!prev || prev.type !== "refund") return prev;
                                    const items = [...prev.items];
                                    items[idx] = { ...items[idx], defective: e.target.checked };
                                    return { ...prev, items };
                                  });
                                }} className={styles.defectiveCheckbox} />
                                <span className={`${styles.defectiveText} ${item.defective ? styles.defectiveTextOn : ""}`}>Defective</span>
                              </label>
                            </div>
                          ))}
                          <div className={styles.refundEditFooter}>
                            <span className={styles.refundEditTotal}>Total: {fmt(editTotal)}</span>
                            <div className={styles.editActions}>
                              <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                              <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={r.id} className={styles.panelRow}>
                        <div className={styles.refundRowInner}>
                          <div className={styles.refundInfo}>
                            <div className={styles.refundLine1}>
                              {r.invoice && <span className={styles.refundInvoice}>{r.invoice} &middot; </span>}
                              <span>{r.customerName || "No customer"}</span>
                            </div>
                            <div className={styles.refundLine2}>
                              {(r.items || []).map((item, i) => (
                                <span key={i}>
                                  {i > 0 ? ", " : ""}{item.qty}&times; {item.product}
                                  {item.defective && <span className={styles.refundDefective}> (defective)</span>}
                                </span>
                              ))}
                              {r.reason && <span> &middot; {r.reason}</span>}
                            </div>
                          </div>
                          <div className={styles.refundRowRight}>
                            <span className={styles.refundAmount}>-{fmt(r.totalRefund || 0)}</span>
                            <button onClick={() => startEdit("refund", r)} className={styles.iconButton} title="Edit">
                              <EditIcon />
                            </button>
                            <button onClick={() => setPendingDelete({ type: "refund", id: r.id })} className={styles.iconButton} title="Delete">
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className={styles.panelEmpty}>No refunds recorded today.</div>
                  )}
                  {(refunds || []).length > 0 && (
                    <div className={styles.panelTotalRow}>
                      <span className={styles.panelTotalLabel}>Total</span>
                      <span className={styles.refundTotalValue}>-{fmt(refundTotal)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
