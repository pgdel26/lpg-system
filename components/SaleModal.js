import React, { useState } from "react";
import { XIcon, PlusIcon } from "./Icons";
import { fmt, getPricebookSrp, today } from "../lib/utils";
import { SALES_SECTIONS } from "../lib/constants";
import CustomerSearch from "./CustomerSearch";

function getProductsForSection(sectionKey) {
  const sec = SALES_SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) return [];
  return sec.subgroups ? sec.subgroups.flatMap((sg) => sg.products) : (sec.products || []);
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
  onClose, onSubmit,
}) {
  const defaultSection = SALES_SECTIONS[0].key;
  const defaultProduct = getProductsForSection(defaultSection)[0] || "";

  const [items, setItems] = useState([
    { section: defaultSection, product: defaultProduct, qty: "1" },
  ]);
  const [saleDate, setSaleDate] = useState(inventoryDate || today());
  const [discount, setDiscount] = useState("");

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
      { section: defaultSection, product: defaultProduct, qty: "1" },
    ]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const getLineSrp = (item) => {
    const sec = SALES_SECTIONS.find((s) => s.key === item.section);
    if (!sec) return 0;
    const prodKey = `${sec.productCategory}_${item.product}`;
    return getPricebookSrp(item.section, prodKey, activePricebook?.prices);
  };

  const getLineTotal = (item) => {
    const srp = getLineSrp(item);
    const qty = parseInt(item.qty) || 1;
    return srp * qty;
  };

  const subtotal = items.reduce((sum, item) => sum + getLineTotal(item), 0);
  const discountNum = parseFloat(discount) || 0;
  const grandTotal = Math.max(0, subtotal - discountNum);

  const handleSubmit = () => {
    onSubmit(items, discountNum, saleDate);
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
            Record Sale
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>

        {/* 1. Date */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Date
          </label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>

        {/* 2. Invoice Number */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Invoice Number
          </label>
          <input
            type="text"
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            placeholder="e.g. INV-001"
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* 2. Customer */}
        <div style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <label style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Customer
            </label>
            <button
              onClick={() => {
                setNewCustomer(!newCustomer);
                setCustomer("");
                setNewName("");
                setNewPhone("");
              }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "11px", fontWeight: 600, color: "var(--accent-blue)",
                fontFamily: "inherit",
              }}
            >
              {newCustomer ? "Select Existing" : "+ New Customer"}
            </button>
          </div>
          {newCustomer ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Customer name"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: "8px",
                  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)", fontSize: "13px", outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone number (optional)"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: "8px",
                  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)", fontSize: "13px", outline: "none",
                  fontFamily: "inherit",
                }}
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

        {/* 3. Products Bought */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Products
          </label>

          {items.map((item, idx) => {
            const products = getProductsForSection(item.section);
            const srp = getLineSrp(item);
            const qty = parseInt(item.qty) || 1;
            const lineTotal = srp * qty;

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
                    {SALES_SECTIONS.map((s) => (
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

                {/* Row 2: Qty × SRP = Line total */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
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
                  <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>×</span>
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    {fmt(srp)}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                    {fmt(lineTotal)}
                  </span>
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

        {/* 4. Payment Type */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Payment Type
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            {[
              { value: "cash", label: "Cash" },
              { value: "ar", label: "Accounts Receivable" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPayment(opt.value)}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "8px",
                  border: payment === opt.value
                    ? "1.5px solid var(--accent-blue)"
                    : "1px solid var(--border-light)",
                  cursor: "pointer",
                  background: payment === opt.value
                    ? "rgba(59,130,246,0.1)"
                    : "rgba(241,245,249,0.6)",
                  color: payment === opt.value
                    ? "var(--accent-blue)"
                    : "var(--text-muted)",
                  fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Discount */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Discount (₱)
          </label>
          <input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0"
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>

        {/* 6. Total Amount */}
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "14px",
          background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)",
        }}>
          {discountNum > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Subtotal</span>
              <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                {fmt(subtotal)}
              </span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total
            </span>
            <span style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
              {fmt(grandTotal)}
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
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#fff", fontSize: "12px", fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            Record Sale
          </button>
        </div>
      </div>
    </div>
  );
}
