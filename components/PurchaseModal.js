import React, { useState } from "react";
import { XIcon, PlusIcon } from "./Icons";
import { fmt } from "../lib/utils";
import { PURCHASE_SECTIONS } from "../lib/constants";

function getProductsForSection(sectionKey) {
  const sec = PURCHASE_SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) return [];
  return sec.subgroups ? sec.subgroups.flatMap((sg) => sg.products) : (sec.products || []);
}

const fieldStyle = {
  padding: "6px 8px", borderRadius: "6px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "11px", outline: "none",
  fontFamily: "inherit",
};

export default function PurchaseModal({
  date, setDate,
  error,
  onClose, onSubmit,
}) {
  const defaultSection = PURCHASE_SECTIONS[0].key;
  const defaultProduct = getProductsForSection(defaultSection)[0] || "";

  const [items, setItems] = useState([
    { section: defaultSection, product: defaultProduct, qty: "1", price: "" },
  ]);

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
      { section: defaultSection, product: defaultProduct, qty: "1", price: "" },
    ]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const getLineTotal = (item) => {
    const qty = parseInt(item.qty) || 0;
    const price = parseFloat(item.price) || 0;
    return qty * price;
  };

  const grandTotal = items.reduce((sum, item) => sum + getLineTotal(item), 0);

  const handleSubmit = () => {
    onSubmit(items);
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
            Record Purchase
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>

        {/* Date */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Date *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>

        {/* Items */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Items
          </label>

          {items.map((item, idx) => {
            const products = getProductsForSection(item.section);
            const qty = parseInt(item.qty) || 0;
            const price = parseFloat(item.price) || 0;
            const lineTotal = qty * price;

            return (
              <div key={idx} style={{
                background: "rgba(241,245,249,0.5)", borderRadius: "10px",
                border: "1px solid var(--border)", padding: "10px 12px",
                marginBottom: "8px",
              }}>
                {/* Row 1: Category + Product + Remove */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
                  <select
                    value={item.section}
                    onChange={(e) => updateItem(idx, "section", e.target.value)}
                    style={{ ...fieldStyle, flex: 1 }}
                  >
                    {PURCHASE_SECTIONS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <select
                    value={item.product}
                    onChange={(e) => updateItem(idx, "product", e.target.value)}
                    style={{ ...fieldStyle, flex: 1 }}
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

                {/* Row 2: Qty + Price + Line total */}
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>Qty</span>
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
                  </div>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>×</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>₱</span>
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => updateItem(idx, "price", e.target.value)}
                      placeholder="0"
                      style={{
                        width: "80px", padding: "4px 6px", borderRadius: "6px",
                        background: "rgba(255,255,255,0.8)", border: "1px solid var(--border-light)",
                        color: "var(--text-secondary)", fontSize: "11px", outline: "none",
                        fontFamily: "var(--font-mono)", textAlign: "right",
                      }}
                    />
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: lineTotal > 0 ? "var(--accent-gold)" : "var(--text-dim)" }}>
                    {lineTotal > 0 ? fmt(lineTotal) : "—"}
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

        {/* Total Cost */}
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "14px",
          background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Cost
          </span>
          <span style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-mono)", color: grandTotal > 0 ? "var(--accent-blue)" : "var(--text-dim)" }}>
            {fmt(grandTotal)}
          </span>
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
            Record Purchase
          </button>
        </div>
      </div>
    </div>
  );
}
