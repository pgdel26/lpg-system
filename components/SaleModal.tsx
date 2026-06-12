import { useState } from "react";
import { XIcon, PlusIcon } from "./Icons";
import { fmt, getPricebookSrp, today } from "../lib/utils";
import CustomerSearch from "./CustomerSearch";
import styles from "./SaleModal.module.css";
import type { Customer, Pricebook } from "../lib/types";
import type { RecordSaleInput } from "../lib/hooks/useSalesData";

type SaleItem = RecordSaleInput["items"][number];

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
  payment: string;
  setPayment: (v: string) => void;
  error: string;
  customers: Customer[];
  activePricebook: Pricebook | null;
  inventoryDate: string;
  salesSections: SalesSection[];
  onClose: () => void;
  onSubmit: (
    items: SaleItem[],
    globalDiscount: number,
    saleDate: string,
    deliveryCharge: number,
    checkData: { checkDate: string; checkAmount: number } | null,
    gcashRef: string,
  ) => void;
}

export default function SaleModal({
  invoice, setInvoice,
  customer, setCustomer,
  newCustomer, setNewCustomer,
  newName, setNewName,
  newPhone, setNewPhone,
  payment, setPayment,
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
  const [gcashRef, setGcashRef] = useState("");

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

  const handleSubmit = () => {
    const checkData = payment === "ar" && checkDate
      ? { checkDate, checkAmount: parseFloat(checkAmount) || 0 }
      : null;
    onSubmit(items, discountNum, saleDate, deliveryNum, checkData, gcashRef.trim());
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
            </div>
          ) : (
            <CustomerSearch
              customers={customers}
              value={customer}
              onChange={setCustomer}
            />
          )}
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
          <div className={styles.paymentToggle}>
            {[
              { value: "cash", label: "Cash", color: "#22c55e", bg: "rgba(34,197,94,0.10)" },
              { value: "gcash", label: "GCash", color: "#3b82f6", bg: "rgba(59,130,246,0.10)" },
              { value: "ar", label: "AR", color: "#f59e42", bg: "rgba(245,158,66,0.10)" },
            ].map((opt, i) => {
              const isActive = payment === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPayment(opt.value)}
                  // payment button colors/weights/shadows are runtime-dynamic (3 active variants)
                  className={`${styles.paymentButton} ${i < 2 ? styles.paymentButtonDivider : ""}`}
                  style={{
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? opt.bg : "rgba(241,245,249,0.5)",
                    color: isActive ? opt.color : "var(--text-dim)",
                    boxShadow: isActive ? `inset 0 -2px 0 ${opt.color}` : "none",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* GCash Reference Number (GCash only) */}
        {payment === "gcash" && (
          <div className={styles.gcashPanel}>
            <label className={styles.gcashLabel}>GCash Reference Number</label>
            <input
              type="text"
              value={gcashRef}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 13);
                setGcashRef(v);
              }}
              placeholder="e.g. 1234567890123"
              maxLength={13}
              className={styles.monoInput}
            />
            <span className={styles.gcashHint}>
              {gcashRef.length > 0 ? `${gcashRef.length}/13 digits` : "Optional — can be added later"}
            </span>
          </div>
        )}

        {/* Post-dated check (AR only) */}
        {payment === "ar" && (
          <div className={styles.arPanel}>
            <label className={styles.arLabel}>Post-Dated Check</label>
            <div className={styles.arRow}>
              <div className={styles.arCol}>
                <span className={styles.arColLabel}>Date of Check</span>
                <input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  className={styles.monoInput}
                  style={{ marginTop: "4px" }}
                />
              </div>
              <div className={styles.arCol}>
                <span className={styles.arColLabel}>Check Amount</span>
                <input
                  type="number"
                  value={checkAmount}
                  onChange={(e) => setCheckAmount(e.target.value)}
                  placeholder="0"
                  className={styles.monoInput}
                  style={{ marginTop: "4px" }}
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
          <button onClick={handleSubmit} className={styles.submitButton}>Record Sale</button>
        </div>
      </div>
    </div>
  );
}
