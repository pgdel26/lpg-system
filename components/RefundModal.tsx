import { useState, useRef, useEffect, useMemo } from "react";
import { XIcon, PlusIcon } from "./Icons";
import { fmt, titleCaseCategory } from "../lib/utils";
import CustomerSearch from "./CustomerSearch";
import styles from "./RefundModal.module.css";
import type { Customer, SaleTransaction } from "../lib/types";
import type { SinglePriceCategory } from "../lib/constants";
import type { RecordRefundInput } from "../lib/hooks/useRefundsData";

type RefundItem = RecordRefundInput["items"][number];

interface GroupedInvoice {
  invoice: string;
  customerName: string;
  customerId: string;
  items: SaleTransaction[];
}

interface RefundModalProps {
  saleTransactions: SaleTransaction[];
  customers: Customer[];
  cylinderProducts: string[];
  singlePriceCategories: SinglePriceCategory[];
  error: string;
  onClose: () => void;
  onSubmit: (input: RecordRefundInput) => void;
}

export default function RefundModal({
  saleTransactions,
  customers,
  cylinderProducts,
  singlePriceCategories,
  error,
  onClose, onSubmit,
}: RefundModalProps) {
  // Cylinder refunds split into empty/full; each single-price category (accessories
  // + any future one) gets its own refund section keyed by category.
  const refundSections = useMemo(() => [
    { key: "emptyCylinder", label: "Empty Cylinder", products: cylinderProducts },
    { key: "fullCylinder", label: "Full Cylinder", products: cylinderProducts },
    ...singlePriceCategories.map((c) => ({
      key: c.category,
      label: titleCaseCategory(c.category),
      products: c.products,
    })),
  ], [cylinderProducts, singlePriceCategories]);

  const getProductsForSection = (sectionKey: string): string[] => {
    const sec = refundSections.find((s) => s.key === sectionKey);
    return sec ? sec.products : [];
  };

  const [invoice, setInvoice] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");

  const defaultSection = refundSections[0].key;
  const defaultProduct = getProductsForSection(defaultSection)[0] || "";

  const [items, setItems] = useState<RefundItem[]>([
    { section: defaultSection, product: defaultProduct, qty: "1", value: "", defective: false },
  ]);
  const [reason, setReason] = useState("");

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close invoice dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setInvoiceOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Get unique invoices from transactions
  const uniqueInvoices = useMemo((): GroupedInvoice[] => {
    const map: Record<string, GroupedInvoice> = {};
    saleTransactions.forEach((t) => {
      if (!t.invoice) return;
      if (!map[t.invoice]) {
        map[t.invoice] = {
          invoice: t.invoice,
          customerName: t.customerName || "",
          customerId: t.customerId || "",
          items: [],
        };
      }
      map[t.invoice].items.push(t);
    });
    return Object.values(map);
  }, [saleTransactions]);

  // Filter invoices by search
  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return uniqueInvoices;
    const q = invoiceSearch.toLowerCase();
    return uniqueInvoices.filter(
      (inv) =>
        inv.invoice.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q)
    );
  }, [uniqueInvoices, invoiceSearch]);

  // Map sale sections to refund sections. The two cylinder sale sections collapse
  // to the full-cylinder refund section; every single-price category sale section
  // (accessories + any future one) maps to its own same-keyed refund section.
  const mapSaleToRefund = (saleSection: string): string => {
    if (saleSection === "cylinderWithRefill" || saleSection === "refill") return "fullCylinder";
    return saleSection;
  };

  // When user selects an invoice, auto-fill everything
  const handleSelectInvoice = (inv: GroupedInvoice) => {
    setInvoice(inv.invoice);
    setInvoiceSearch(inv.invoice);
    setInvoiceOpen(false);
    setCustomerName(inv.customerName);
    setCustomerId(inv.customerId);

    // Group items by section+product, sum quantities, get unit price
    const grouped: Record<string, { section: string; product: string; qty: number; totalAmount: number }> = {};
    inv.items.forEach((t) => {
      const refundSection = mapSaleToRefund(t.saleSection);
      const key = `${refundSection}_${t.product}`;
      if (!grouped[key]) {
        grouped[key] = { section: refundSection, product: t.product, qty: 0, totalAmount: 0 };
      }
      grouped[key].qty += (t.quantity || 1);
      grouped[key].totalAmount += (t.totalAmount || t.finalPrice || 0);
    });
    setItems(
      Object.values(grouped).map((g) => ({
        section: g.section,
        product: g.product,
        qty: String(g.qty),
        value: String(g.totalAmount || ""),
        defective: false,
      }))
    );
  };

  const updateItem = (index: number, field: string, value: string | number | boolean) => {
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
      { section: defaultSection, product: defaultProduct, qty: "1", value: "", defective: false },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Total refund = sum of all item values
  const totalRefund = items.reduce((sum, item) => sum + (parseFloat(String(item.value)) || 0), 0);

  const handleSubmit = () => {
    onSubmit({ invoice, customerName, customerId, items, totalRefund, reason });
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Record Refund / Return</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        {/* 1. Invoice Search */}
        <div className={`${styles.fieldGroup} ${styles.invoiceWrapper}`} ref={wrapperRef}>
          <label className={styles.label}>Invoice Number</label>
          <input
            type="text"
            value={invoiceSearch}
            onChange={(e) => {
              setInvoiceSearch(e.target.value);
              setInvoiceOpen(true);
              if (e.target.value !== invoice) setInvoice("");
            }}
            onFocus={() => setInvoiceOpen(true)}
            placeholder="Search invoice number..."
            className={styles.invoiceInput}
          />
          {invoiceOpen && filteredInvoices.length > 0 && (
            <div className={styles.invoiceDropdown}>
              {filteredInvoices.map((inv) => {
                const totalQty = inv.items.reduce((s, t) => s + (t.quantity || 1), 0);
                return (
                  <div
                    key={inv.invoice}
                    onClick={() => handleSelectInvoice(inv)}
                    className={styles.invoiceOption}
                  >
                    <div className={styles.invoiceOptionLabel}>{inv.invoice}</div>
                    <div className={styles.invoiceOptionMeta}>
                      {inv.customerName || "No customer"} &middot; {totalQty} item{totalQty !== 1 ? "s" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Customer */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Customer</label>
          <CustomerSearch
            customers={customers || []}
            value={customerId}
            onChange={(id) => {
              setCustomerId(id);
              const c = (customers || []).find((c) => c.id === id);
              setCustomerName(c ? c.name : "");
            }}
          />
        </div>

        {/* 3. Products */}
        <div className={styles.fieldGroup}>
          <label className={styles.smallLabel}>Products</label>

          {items.map((item, idx) => {
            const products = getProductsForSection(String(item.section));

            return (
              <div key={idx} className={styles.itemCard}>
                {/* Row 1: Section + Product + Remove */}
                <div className={styles.itemRow1}>
                  <select
                    value={String(item.section)}
                    onChange={(e) => updateItem(idx, "section", e.target.value)}
                    className={styles.fieldSelect}
                  >
                    {refundSections.map((s) => (
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

                {/* Row 2: Qty + Value + Defective */}
                <div className={styles.itemRow2}>
                  <div className={styles.qtyValueGroup}>
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
                    <div className={styles.valueGroup}>
                      <span className={styles.dimLabel}>₱</span>
                      <input
                        type="number"
                        min="0"
                        value={String(item.value)}
                        onChange={(e) => updateItem(idx, "value", e.target.value)}
                        placeholder="0"
                        className={styles.valueInput}
                      />
                    </div>
                  </div>
                  <label className={styles.defectiveLabel}>
                    <input
                      type="checkbox"
                      checked={item.defective || false}
                      onChange={(e) => updateItem(idx, "defective", e.target.checked)}
                      className={styles.defectiveCheckbox}
                    />
                    {/* Color toggles on defective state — stay inline */}
                    <span
                      className={styles.defectiveText}
                      style={{ color: item.defective ? "#f87171" : "var(--text-dim)" }}
                    >
                      Defective
                    </span>
                  </label>
                </div>
              </div>
            );
          })}

          <button onClick={addItem} className={styles.addItemButton}>
            <PlusIcon /> Add Item
          </button>
        </div>

        {/* 4. Reason */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Reason (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Defective, wrong product..."
            className={styles.reasonInput}
          />
        </div>

        {/* 5. Total Refund */}
        <div className={styles.totalCard}>
          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Total Refund</span>
            {/* totalRefund color is runtime-dynamic */}
            <span
              className={styles.totalValue}
              style={{ color: totalRefund > 0 ? "#f87171" : "var(--text-dim)" }}
            >
              {totalRefund > 0 ? fmt(totalRefund) : "₱0.00"}
            </span>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSubmit} className={styles.submitButton}>Record Refund</button>
        </div>
      </div>
    </div>
  );
}
