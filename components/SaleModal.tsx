import { useState } from "react";
import { XIcon, PlusIcon } from "./Icons";
import { fmt, getPricebookSrp, today } from "../lib/utils";
import CustomerSearch from "./CustomerSearch";
import { formatMonth } from "../lib/customerTargets";
import type { CustomerTargetStatus } from "../lib/customerTargets";
import styles from "./SaleModal.module.css";
import type { Customer, CustomerCategory, Pricebook, PaymentType } from "../lib/types";
import type { RecordSaleInput, RecordSalePaymentInput } from "../lib/hooks/useSalesData";

type SaleItem = RecordSaleInput["items"][number];

const METHOD_META: Record<PaymentType, { label: string; color: string }> = {
  cash: { label: "Cash", color: "#22c55e" },
  gcash: { label: "GCash", color: "#3b82f6" },
  ar: { label: "AR", color: "#f59e42" },
};
const METHOD_ORDER: PaymentType[] = ["cash", "gcash", "ar"];

interface SalesSubgroup {
  label: string;
  products: string[];
}

interface SalesSection {
  key: string;
  label: string;
  products?: string[];
  subgroups?: SalesSubgroup[];
  productCategory: string;
}

interface SaleModalProps {
  invoice: string;
  setInvoice: (v: string) => void;
  customer: string;
  setCustomer: (v: string) => void;
  newCustomer: boolean;
  setNewCustomer: (v: boolean) => void;
  newName: string;
  setNewName: (v: string) => void;
  newPhone: string;
  setNewPhone: (v: string) => void;
  /** Category for a newly typed customer. Also decides whether an existing
      record of that name is reused rather than duplicated — see matchCustomer. */
  newCategory: string;
  setNewCategory: (v: string) => void;
  customerCategories: CustomerCategory[];
  error: string;
  customers: Customer[];
  activePricebook: Pricebook | null;
  inventoryDate: string;
  /**
   * The selected customer's standing on every product they have a monthly
   * target for — empty when they have none. One line per product, because an
   * agreement is per product: a customer can be over on the 11KG and short on
   * the 50KG at the same time, and a single blended line would be true of
   * neither. READ ONLY — this modal never applies the discount, it only says
   * whether one has been earned. Making it automatic would put a rule this
   * screen can't see onto the money path; the operator still types the figure
   * into Discount below.
   */
  targetStatuses?: CustomerTargetStatus[];
  salesSections: SalesSection[];
  onClose: () => void;
  onSubmit: (
    items: SaleItem[],
    globalDiscount: number,
    saleDate: string,
    deliveryCharge: number,
    checkData: { checkDate: string; checkAmount: number } | null,
    payments: RecordSalePaymentInput[],
  ) => void;
}

export default function SaleModal({
  invoice, setInvoice,
  customer, setCustomer,
  newCustomer, setNewCustomer,
  targetStatuses,
  newName, setNewName,
  newPhone, setNewPhone,
  newCategory, setNewCategory,
  customerCategories,
  error,
  customers, activePricebook, inventoryDate,
  salesSections,
  onClose, onSubmit,
}: SaleModalProps) {
  const getProductsForSection = (sectionKey: string): string[] => {
    const sec = salesSections.find((s) => s.key === sectionKey);
    if (!sec) return [];
    return sec.subgroups ? sec.subgroups.flatMap((sg) => sg.products) : (sec.products || []);
  };

  const defaultSection = salesSections[0].key;
  const defaultProduct = getProductsForSection(defaultSection)[0] || "";

  const [items, setItems] = useState<SaleItem[]>([
    { section: defaultSection, product: defaultProduct, qty: "1" },
  ]);
  const [saleDate, setSaleDate] = useState(inventoryDate || today());
  const [discount, setDiscount] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [checkAmount, setCheckAmount] = useState("");

  // ---- Payment state ----
  // Check a method to reveal its amount field; checked methods must sum to
  // the total. Cash is checked by default. When exactly one method is
  // checked, its amount always tracks the live grand total (never stale,
  // even if items/discount/delivery change afterward) — it only becomes a
  // fixed, manually-entered value once a second method is checked too.
  const [splitEnabled, setSplitEnabled] = useState<Record<PaymentType, boolean>>({ cash: true, gcash: false, ar: false });
  const [splitAmount, setSplitAmount] = useState<Record<PaymentType, string>>({ cash: "", gcash: "", ar: "" });
  const [splitGcashRef, setSplitGcashRef] = useState("");

  const updateItem = (index: number, field: string, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "section") {
        const prods = getProductsForSection(String(value));
        next[index] = { ...next[index], product: prods[0] || "" };
      }
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { section: defaultSection, product: defaultProduct, qty: "1" },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const getLineSrp = (item: SaleItem): number => {
    const sec = salesSections.find((s) => s.key === item.section);
    if (!sec) return 0;
    const prodKey = `${sec.productCategory}_${item.product}`;
    return getPricebookSrp(item.section, prodKey, activePricebook?.prices);
  };

  const getLineTotal = (item: SaleItem): number => {
    const srp = getLineSrp(item);
    const qty = parseInt(String(item.qty)) || 1;
    return srp * qty;
  };

  const subtotal = items.reduce((sum, item) => sum + getLineTotal(item), 0);
  const discountNum = parseFloat(discount) || 0;
  const deliveryNum = parseFloat(deliveryCharge) || 0;
  const grandTotal = Math.max(0, subtotal - discountNum + deliveryNum);

  // ---- Split payment helpers ----
  const enabledMethods = METHOD_ORDER.filter((m) => splitEnabled[m]);
  const isSolo = enabledMethods.length === 1;

  // When exactly one method is checked, its amount is always the live grand
  // total — not a stored value, so it can never go stale if items/discount/
  // delivery change after. Once a second method is checked, amounts become
  // explicit/manual (see toggleSplitMethod for the freeze/heal transitions).
  const amountFor = (method: PaymentType): number =>
    (isSolo && enabledMethods[0] === method) ? grandTotal : (parseFloat(splitAmount[method]) || 0);

  const splitTotal = enabledMethods.reduce((sum, m) => sum + amountFor(m), 0);
  // Round to centavos to avoid float noise showing "Remaining: ₱0.00000001".
  const remaining = Math.round((grandTotal - splitTotal) * 100) / 100;
  const isBalanced = Math.round(remaining * 100) === 0;
  const hasAr = splitEnabled.ar;

  const toggleSplitMethod = (method: PaymentType) => {
    const currentlyEnabled = METHOD_ORDER.filter((m) => splitEnabled[m]);
    const turningOn = !splitEnabled[method];

    if (turningOn) {
      const willBeEnabled = [...currentlyEnabled, method];
      setSplitEnabled((prev) => ({ ...prev, [method]: true }));
      setSplitAmount((prev) => {
        const next = { ...prev };
        if (willBeEnabled.length === 1) {
          next[method] = String(grandTotal);
        } else {
          if (currentlyEnabled.length === 1) {
            // Freeze the previously-solo method's live total into a real value.
            next[currentlyEnabled[0]] = String(grandTotal);
          }
          const allocated = currentlyEnabled.reduce((sum, m) => sum + (parseFloat(next[m]) || 0), 0);
          next[method] = String(Math.max(0, Math.round((grandTotal - allocated) * 100) / 100));
        }
        return next;
      });
    } else {
      setSplitEnabled((prev) => ({ ...prev, [method]: false }));
      setSplitAmount((prev) => ({ ...prev, [method]: "" }));
      if (method === "gcash") setSplitGcashRef("");
    }
  };

  const putRemainderOnAccount = () => {
    if (remaining <= 0) return;
    const currentlyEnabled = METHOD_ORDER.filter((m) => splitEnabled[m]);
    setSplitEnabled((prev) => ({ ...prev, ar: true }));
    setSplitAmount((prev) => {
      const next = { ...prev };
      if (currentlyEnabled.length === 1 && !splitEnabled.ar) {
        // Freeze the previously-solo method's live total before adding AR.
        next[currentlyEnabled[0]] = String(grandTotal);
      }
      next.ar = String((parseFloat(next.ar) || 0) + remaining);
      return next;
    });
  };

  const handleSubmit = () => {
    const payments: RecordSalePaymentInput[] = enabledMethods.map((m) => ({
      method: m,
      amount: amountFor(m),
      gcashRef: m === "gcash" ? (splitGcashRef.trim() || undefined) : undefined,
    }));

    const checkData = hasAr && checkDate
      ? { checkDate, checkAmount: parseFloat(checkAmount) || 0 }
      : null;

    onSubmit(items, discountNum, saleDate, deliveryNum, checkData, payments);
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Record Sale</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        {/* 1. Date */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Date</label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className={styles.dateInput}
          />
        </div>

        {/* 2. Invoice Number */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Invoice Number</label>
          <input
            type="text"
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            placeholder="e.g. INV-001"
            className={styles.textInput}
          />
        </div>

        {/* 3. Customer */}
        <div className={styles.fieldGroup}>
          <div className={styles.customerFieldHeader}>
            <label className={styles.label}>Customer</label>
            <button
              onClick={() => {
                setNewCustomer(!newCustomer);
                setCustomer("");
                setNewName("");
                setNewPhone("");
                setNewCategory("");
              }}
              className={styles.toggleButton}
            >
              {newCustomer ? "Select Existing" : "+ New Customer"}
            </button>
          </div>
          {newCustomer ? (
            <div className={styles.newCustomerInputs}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Customer name"
                className={styles.textInput}
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone number (optional)"
                className={styles.textInput}
              />
              {/* Only offered once categories exist. It files the new customer
                  AND decides identity: the same name under the same category is
                  the same customer and is reused rather than duplicated. */}
              {customerCategories.length > 0 && (
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className={styles.textInput}
                  aria-label="Customer category"
                >
                  <option value="">Uncategorised</option>
                  {customerCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <CustomerSearch
              customers={customers}
              value={customer}
              onChange={setCustomer}
            />
          )}

          {/* One line per product this customer has a target for. Says what
              has been earned; changes nothing. The Discount field below stays
              exactly as it was — typed by hand. Every line names its product:
              without that, two lines showing different numbers for "the
              target" would be unreadable. */}
          {(targetStatuses || []).map((status) => (
            <div
              key={status.product}
              className={status.reached ? styles.targetReached : styles.targetShort}
            >
              {status.reached ? (
                <>
                  <strong>
                    {status.product} — {formatMonth(status.month)} target reached
                    {" "}({status.actualQty.toLocaleString("en-PH")}/{status.targetQty.toLocaleString("en-PH")})
                  </strong>
                  {status.discountPerUnit > 0 && (
                    <> — earns {fmt(status.discountPerUnit)}/unit, {fmt(status.earned)} so far this month.</>
                  )}
                </>
              ) : (
                <>
                  <strong>{status.product}</strong> — {formatMonth(status.month)} target:
                  {" "}{status.actualQty.toLocaleString("en-PH")}/{status.targetQty.toLocaleString("en-PH")}
                  {" "}— <strong>{status.remaining.toLocaleString("en-PH")} to go</strong> before the
                  {" "}{fmt(status.discountPerUnit)}/unit discount applies.
                </>
              )}
            </div>
          ))}
        </div>

        {/* 4. Products Bought */}
        <div className={styles.fieldGroup}>
          <label className={styles.smallLabel}>Products</label>

          {items.map((item, idx) => {
            const products = getProductsForSection(String(item.section));
            const srp = getLineSrp(item);
            const qty = parseInt(String(item.qty)) || 1;
            const lineTotal = srp * qty;

            return (
              <div key={idx} className={styles.itemCard}>
                {/* Row 1: Section + Product + Remove */}
                <div className={styles.itemRow1}>
                  <select
                    value={String(item.section)}
                    onChange={(e) => updateItem(idx, "section", e.target.value)}
                    className={styles.fieldSelect}
                  >
                    {salesSections.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <select
                    value={String(item.product)}
                    onChange={(e) => updateItem(idx, "product", e.target.value)}
                    className={styles.fieldSelect}
                  >
                    {products.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className={styles.removeButton}>
                      <XIcon />
                    </button>
                  )}
                </div>

                {/* Row 2: Qty × SRP = Line total */}
                <div className={styles.itemRow2}>
                  <div className={styles.qtyGroup}>
                    <span className={styles.dimLabel}>Qty</span>
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "qty", Math.max(1, (parseInt(String(item.qty)) || 1) - 1))}
                      className={styles.stepButton}
                    >−</button>
                    <input
                      type="number"
                      min="1"
                      value={String(item.qty)}
                      onChange={(e) => updateItem(idx, "qty", e.target.value)}
                      className={styles.qtyInput}
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "qty", (parseInt(String(item.qty)) || 1) + 1)}
                      className={styles.stepButton}
                    >+</button>
                  </div>
                  <span className={styles.dimLabel}>×</span>
                  <span className={styles.srpDisplay}>{fmt(srp)}</span>
                  <span className={styles.lineTotal}>{fmt(lineTotal)}</span>
                </div>
              </div>
            );
          })}

          <button onClick={addItem} className={styles.addItemButton}>
            <PlusIcon /> Add Item
          </button>
        </div>

        {/* 5. Payment Type */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Payment Type</label>

          <div className={styles.splitEditor}>
            {/* Check a method to reveal its amount field. */}
            <div className={styles.splitCheckRow}>
              {METHOD_ORDER.map((method) => {
                const meta = METHOD_META[method];
                const checked = splitEnabled[method];
                return (
                  <label
                    key={method}
                    className={styles.splitCheckLabel}
                    style={{ color: checked ? meta.color : "var(--text-dim)" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSplitMethod(method)}
                      className={styles.splitCheckbox}
                    />
                    {meta.label}
                  </label>
                );
              })}
            </div>

            {enabledMethods.map((method) => {
              const meta = METHOD_META[method];
              const soloAndLive = isSolo && enabledMethods[0] === method;
              return (
                <div key={method} className={styles.splitRow}>
                  <div className={styles.splitRowMain}>
                    <span className={styles.splitRowMethodLabel} style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <div className={styles.splitAmountGroup}>
                      <span className={styles.pesoSign}>₱</span>
                      <input
                        type="number"
                        value={soloAndLive ? grandTotal : splitAmount[method]}
                        onChange={(e) => setSplitAmount((prev) => ({ ...prev, [method]: e.target.value }))}
                        disabled={soloAndLive}
                        placeholder="0"
                        className={styles.splitAmountInput}
                      />
                    </div>
                  </div>
                  {method === "gcash" && (
                    <input
                      type="text"
                      value={splitGcashRef}
                      onChange={(e) => setSplitGcashRef(e.target.value.replace(/\D/g, "").slice(0, 13))}
                      placeholder="GCash reference (13 digits, optional)"
                      maxLength={13}
                      className={styles.splitGcashRefInput}
                    />
                  )}
                </div>
              );
            })}

            {!isBalanced && (
              <div className={`${styles.remainingRow} ${remaining > 0 ? styles.remainingUnder : styles.remainingOver}`}>
                <span>
                  {remaining > 0 ? `Remaining: ${fmt(remaining)}` : `Over by ${fmt(Math.abs(remaining))}`}
                </span>
                {remaining > 0 && (
                  <button onClick={putRemainderOnAccount} className={styles.putOnAccountButton}>
                    Put {fmt(remaining)} on account
                  </button>
                )}
              </div>
            )}
            </div>
        </div>

        {/* Post-dated check (whenever an AR leg is present) */}
        {hasAr && (
          <div className={styles.arPanel}>
            <label className={styles.arLabel}>Post-Dated Check</label>
            <div className={styles.arRow}>
              <div className={styles.arCol}>
                <span className={styles.arColLabel}>Date of Check</span>
                <input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  className={`${styles.monoInput} ${styles.arInput}`}
                />
              </div>
              <div className={styles.arCol}>
                <span className={styles.arColLabel}>Check Amount</span>
                <input
                  type="number"
                  value={checkAmount}
                  onChange={(e) => setCheckAmount(e.target.value)}
                  placeholder="0"
                  className={`${styles.monoInput} ${styles.arInput}`}
                />
              </div>
            </div>
          </div>
        )}

        {/* 6. Discount */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Discount (₱)</label>
          <input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0"
            className={styles.monoInput}
          />
        </div>

        {/* 7. Delivery Charge */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Delivery Charge (₱)</label>
          <input
            type="number"
            value={deliveryCharge}
            onChange={(e) => setDeliveryCharge(e.target.value)}
            placeholder="0"
            className={styles.monoInput}
          />
        </div>

        {/* 8. Total Amount */}
        <div className={styles.totalsCard}>
          {(discountNum > 0 || deliveryNum > 0) && (
            <div className={styles.totalsRow}>
              <span className={styles.subtotalLabel}>Subtotal</span>
              <span className={styles.subtotalValue}>{fmt(subtotal)}</span>
            </div>
          )}
          {discountNum > 0 && (
            <div className={styles.totalsRow}>
              <span className={styles.discountLabel}>Discount</span>
              <span className={styles.discountValue}>−{fmt(discountNum)}</span>
            </div>
          )}
          {deliveryNum > 0 && (
            <div className={styles.totalsRow}>
              <span className={styles.deliveryLabel}>Delivery</span>
              <span className={styles.deliveryValue}>+{fmt(deliveryNum)}</span>
            </div>
          )}
          <div className={styles.totalsRowFinal}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalValue}>{fmt(grandTotal)}</span>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!isBalanced}
            className={styles.submitButton}
            style={!isBalanced ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            Record Sale
          </button>
        </div>
      </div>
    </div>
  );
}
