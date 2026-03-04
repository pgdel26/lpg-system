import React, { useState, useRef, useEffect, useMemo } from "react";
import { XIcon, PlusIcon } from "./Icons";
import { fmt } from "../lib/utils";
import { FULL_CYLINDER_PRODUCTS, ALL_ACCESSORIES } from "../lib/constants";
import CustomerSearch from "./CustomerSearch";

const REFUND_SECTIONS = [
  { key: "emptyCylinder", label: "Empty Cylinder", products: FULL_CYLINDER_PRODUCTS },
  { key: "fullCylinder", label: "Full Cylinder", products: FULL_CYLINDER_PRODUCTS },
  { key: "accessories", label: "Accessories", products: ALL_ACCESSORIES },
];

function getProductsForSection(sectionKey) {
  const sec = REFUND_SECTIONS.find((s) => s.key === sectionKey);
  return sec ? sec.products : [];
}

export default function RefundModal({
  saleTransactions,
  customers,
  error,
  onClose, onSubmit,
}) {
  const [invoice, setInvoice] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");

  const defaultSection = REFUND_SECTIONS[0].key;
  const defaultProduct = getProductsForSection(defaultSection)[0] || "";

  const [items, setItems] = useState([
    { section: defaultSection, product: defaultProduct, qty: "1", value: "", defective: false },
  ]);
  const [reason, setReason] = useState("");

  const wrapperRef = useRef(null);

  // Close invoice dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setInvoiceOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Get unique invoices from transactions
  const uniqueInvoices = useMemo(() => {
    const map = {};
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

  // Map sale sections to refund sections
  const mapSaleToRefund = (saleSection) => {
    if (saleSection === "accessories") return "accessories";
    return "fullCylinder"; // cylinderWithRefill or refill → full cylinder by default
  };

  // When user selects an invoice, auto-fill everything
  const handleSelectInvoice = (inv) => {
    setInvoice(inv.invoice);
    setInvoiceSearch(inv.invoice);
    setInvoiceOpen(false);
    setCustomerName(inv.customerName);
    setCustomerId(inv.customerId);

    // Group items by section+product, sum quantities, get unit price
    const grouped = {};
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

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "section") {
        const prods = getProductsForSection(value);
        next[index].product = prods[0] || "";
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

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Total refund = sum of all item values
  const totalRefund = items.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);

  const handleSubmit = () => {
    onSubmit({
      invoice,
      customerName,
      customerId,
      items,
      totalRefund,
      reason,
    });
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: "16px",
        border: "1px solid var(--border)", padding: "24px",
        width: "100%", maxWidth: "560px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
            Record Refund / Return
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>

        {/* 1. Invoice Search */}
        <div style={{ marginBottom: "14px", position: "relative" }} ref={wrapperRef}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Invoice Number
          </label>
          <input
            type="text"
            value={invoiceSearch}
            onChange={(e) => {
              setInvoiceSearch(e.target.value);
              setInvoiceOpen(true);
              if (e.target.value !== invoice) {
                setInvoice("");
              }
            }}
            onFocus={() => setInvoiceOpen(true)}
            placeholder="Search invoice number..."
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "inherit",
            }}
          />
          {invoiceOpen && filteredInvoices.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
              background: "var(--bg-card)", borderRadius: "8px",
              border: "1px solid var(--border)", marginTop: "4px",
              maxHeight: "160px", overflowY: "auto",
              boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
            }}>
              {filteredInvoices.map((inv) => {
                const totalQty = inv.items.reduce((s, t) => s + (t.quantity || 1), 0);
                return (
                  <div
                    key={inv.invoice}
                    onClick={() => handleSelectInvoice(inv)}
                    style={{
                      padding: "8px 12px", cursor: "pointer",
                      borderBottom: "1px solid rgba(15,23,42,0.04)",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59,130,246,0.06)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {inv.invoice}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "1px" }}>
                      {inv.customerName || "No customer"} &middot; {totalQty} item{totalQty !== 1 ? "s" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Customer */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Customer
          </label>
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
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Products
          </label>

          {items.map((item, idx) => {
            const products = getProductsForSection(item.section);

            return (
              <div key={idx} style={{
                background: "rgba(241,245,249,0.5)", borderRadius: "10px",
                border: "1px solid var(--border)", padding: "10px 12px",
                marginBottom: "8px",
              }}>
                {/* Row 1: Section + Product + Remove */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
                  <select
                    value={item.section}
                    onChange={(e) => updateItem(idx, "section", e.target.value)}
                    style={{
                      flex: 1, padding: "6px 8px", borderRadius: "6px",
                      background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                      color: "var(--text-secondary)", fontSize: "11px", outline: "none",
                      fontFamily: "inherit",
                    }}
                  >
                    {REFUND_SECTIONS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <select
                    value={item.product}
                    onChange={(e) => updateItem(idx, "product", e.target.value)}
                    style={{
                      flex: 1, padding: "6px 8px", borderRadius: "6px",
                      background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                      color: "var(--text-secondary)", fontSize: "11px", outline: "none",
                      fontFamily: "inherit",
                    }}
                  >
                    {products.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-dim)", display: "flex", padding: "2px",
                        flexShrink: 0,
                      }}
                    >
                      <XIcon />
                    </button>
                  )}
                </div>

                {/* Row 2: Qty + Value + Defective */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Qty</span>
                      <button
                        type="button"
                        onClick={() => updateItem(idx, "qty", Math.max(1, (parseInt(item.qty) || 1) - 1))}
                        style={{
                          width: "24px", height: "24px", borderRadius: "6px", border: "1px solid var(--border-light)",
                          background: "rgba(255,255,255,0.8)", cursor: "pointer", display: "flex",
                          alignItems: "center", justifyContent: "center", fontSize: "14px", color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)", padding: 0, lineHeight: 1,
                        }}
                      >−</button>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateItem(idx, "qty", e.target.value)}
                        style={{
                          width: "44px", padding: "4px 6px", borderRadius: "6px",
                          background: "rgba(255,255,255,0.8)", border: "1px solid var(--border-light)",
                          color: "var(--text-secondary)", fontSize: "11px", outline: "none",
                          fontFamily: "var(--font-mono)", textAlign: "center",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(idx, "qty", (parseInt(item.qty) || 1) + 1)}
                        style={{
                          width: "24px", height: "24px", borderRadius: "6px", border: "1px solid var(--border-light)",
                          background: "rgba(255,255,255,0.8)", cursor: "pointer", display: "flex",
                          alignItems: "center", justifyContent: "center", fontSize: "14px", color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)", padding: 0, lineHeight: 1,
                        }}
                      >+</button>
                    </div>
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>₱</span>
                      <input
                        type="number"
                        min="0"
                        value={item.value}
                        onChange={(e) => updateItem(idx, "value", e.target.value)}
                        placeholder="0"
                        style={{
                          width: "80px", padding: "4px 6px", borderRadius: "6px",
                          background: "rgba(255,255,255,0.8)", border: "1px solid var(--border-light)",
                          color: "var(--text-secondary)", fontSize: "11px", outline: "none",
                          fontFamily: "var(--font-mono)", textAlign: "right",
                        }}
                      />
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={item.defective || false}
                      onChange={(e) => updateItem(idx, "defective", e.target.checked)}
                      style={{ width: "13px", height: "13px", cursor: "pointer", accentColor: "#ef4444" }}
                    />
                    <span style={{ fontSize: "11px", fontWeight: 600, color: item.defective ? "#f87171" : "var(--text-dim)" }}>
                      Defective
                    </span>
                  </label>
                </div>
              </div>
            );
          })}

          <button
            onClick={addItem}
            style={{
              display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px",
              borderRadius: "8px", border: "1px dashed var(--border-light)",
              cursor: "pointer", background: "transparent",
              color: "var(--accent-blue)", fontSize: "11px", fontWeight: 600,
              fontFamily: "inherit", width: "100%", justifyContent: "center",
            }}
          >
            <PlusIcon /> Add Item
          </button>
        </div>

        {/* 4. Reason */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Reason (optional)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Defective, wrong product..."
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* 5. Total Refund */}
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "14px",
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Refund
            </span>
            <span style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-mono)", color: totalRefund > 0 ? "#f87171" : "var(--text-dim)" }}>
              {totalRefund > 0 ? fmt(totalRefund) : "₱0.00"}
            </span>
          </div>
        </div>

        {error && (
          <div style={{
            padding: "8px 12px", borderRadius: "8px", marginBottom: "14px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            fontSize: "12px", color: "#f87171", fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-light)",
              cursor: "pointer", background: "transparent", color: "var(--text-muted)",
              fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 20px", borderRadius: "8px", border: "none",
              cursor: "pointer",
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "#fff", fontSize: "12px", fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            Record Refund
          </button>
        </div>
      </div>
    </div>
  );
}
