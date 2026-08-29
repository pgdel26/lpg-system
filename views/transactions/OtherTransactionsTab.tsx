import { fmt } from "../../lib/utils";
import { EditIcon, TrashIcon } from "../../components/Icons";
import { type CollectionBatch } from "../../lib/receivables";
import CollectionsList from "../../components/CollectionsList";
import type { SaleTransaction, Swap, Refund, Branch } from "../../lib/types";
import type { EditData, PendingDelete } from "./transactionsTypes";
import styles from "./OtherTransactionsTab.module.css";

interface OtherTransactionsTabProps {
  swaps: Swap[];
  refunds: Refund[];
  swapTotal: number;
  refundTotal: number;
  onOpenSwapModal: () => void;
  /** Opens the same RecordCollectionModal the Receivables page uses — collecting
   *  on an invoice is the same event wherever it is entered from. */
  onOpenCollectionModal: () => void;

  // ---- A/R collections recorded on this date, at this outlet ----
  /** One row per collection, not per event — see collectionBatches(). */
  collections: CollectionBatch[];
  /** Every method. What was collected today, full stop. */
  collectionTotal: number;
  /** The cash-only subset, i.e. the part that reaches Expected Cash Remit. */
  collectionCashTotal: number;
  branches: Branch[];
  onEditCollection: (batch: CollectionBatch) => void;
  onVoidCollection: (batch: CollectionBatch) => void;

  // Shared inline-edit state (owned by parent)
  editingId: string | null;
  editData: EditData | null;
  setEditData: React.Dispatch<React.SetStateAction<EditData | null>>;
  startEdit: (type: "sale" | "swap" | "refund", item: SaleTransaction | Swap | Refund) => void;
  cancelEdit: () => void;
  saveEdit: () => Promise<void> | void;
  setPendingDelete: (d: PendingDelete | null) => void;
}

/**
 * Everything on the day that ISN'T a sale: upgrades/swaps, refunds/returns and
 * A/R collections.
 *
 * These three were a collapsible side panel squeezed beside the sales table.
 * The owner asked for them as a tab of their own — which is also the honest
 * shape, because each is a different KIND of money event: a swap is an exchange
 * that brings in cash, a refund pays cash out, and a collection is money against
 * an invoice raised on some earlier day. Given the full width they get real
 * columns instead of a 280px strip.
 *
 * The day being shown, the outlet, and the New Sale / Add AR Collection buttons
 * all live in the outlet page's shared header, so this tab carries no toolbar.
 */
export default function OtherTransactionsTab({
  swaps, refunds, swapTotal, refundTotal,
  onOpenSwapModal, onOpenCollectionModal,
  collections, collectionTotal, collectionCashTotal, branches,
  onEditCollection, onVoidCollection,
  editingId, editData, setEditData, startEdit, cancelEdit, saveEdit, setPendingDelete,
}: OtherTransactionsTabProps) {
  return (
    <div className={styles.grid}>
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

      {/* A/R Collections section.
          Deliberately NOT folded into the Cash/GCash/A-R totals on the
          sales table to the left: those three reconcile the day's SALES
          by channel, while a collection is money against an invoice
          raised on some earlier day. The Sales Report keeps them on
          separate lines for the same reason. What this panel adds is
          visibility — the Add AR Collection button lives in this page's
          header, and until now nothing on the page showed the result,
          so a collection booked with the wrong method was invisible
          here until it turned up as a drawer shortage. */}
      <div className={styles.panelSection}>
        <div className={styles.panelHeading}>
          <div className={styles.panelHeadingInner}>
            <div className={`${styles.dot} ${styles.dotGreen}`} />
            <h3 className={styles.panelTitle}>A/R Collections</h3>
          </div>
          <div className={styles.panelHeadingActions}>
            <button onClick={onOpenCollectionModal} className={styles.swapNewButton}>New</button>
          </div>
        </div>

        <div className={styles.card}>
          <CollectionsList
            batches={collections}
            branches={branches}
            onEdit={onEditCollection}
            onVoid={onVoidCollection}
            emptyText="No collections recorded today."
            showDate={false}
          />
          {collections.length > 0 && (
            <>
              <div className={styles.panelTotalRow}>
                <span className={styles.panelTotalLabel}>Total collected</span>
                <span className={styles.panelTotalValue}>{fmt(collectionTotal)}</span>
              </div>
              {/* The split that actually matters for closing the day.
                  Only the cash half is in Expected Cash Remit. */}
              <div className={styles.panelTotalRow}>
                <span className={styles.panelTotalLabel}>Of which cash (in remit)</span>
                <span className={styles.panelTotalValue}>{fmt(collectionCashTotal)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
