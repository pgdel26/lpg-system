import React from "react";
import { XIcon, SwapIcon } from "./Icons";
import { FULL_CYLINDER_PRODUCTS } from "../lib/constants";
import CustomerSearch from "./CustomerSearch";

const selectStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "8px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "12px", outline: "none",
  fontFamily: "inherit",
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "8px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "12px", outline: "none",
  fontFamily: "inherit", marginTop: "6px",
};

export default function SwapModal({
  productFrom, setProductFrom,
  productTo, setProductTo,
  customFrom, setCustomFrom,
  price, setPrice,
  customer, setCustomer,
  newCustomer, setNewCustomer,
  newName, setNewName,
  newPhone, setNewPhone,
  customers,
  error,
  onClose, onSubmit,
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: "16px",
        border: "1px solid var(--border)", padding: "24px",
        width: "100%", maxWidth: "520px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Record Upgrade / Swap</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>

        {/* Customer */}
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

        {/* Side-by-side product selectors */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "14px" }}>
          {/* Product To Swap (giving back) */}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Product To Swap
            </label>
            <select
              value={productFrom}
              onChange={(e) => { setProductFrom(e.target.value); if (e.target.value !== "Other") setCustomFrom(""); }}
              style={selectStyle}
            >
              {FULL_CYLINDER_PRODUCTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="Other">Other</option>
            </select>
            {productFrom === "Other" && (
              <input
                type="text"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                placeholder="Product name..."
                autoFocus
                style={inputStyle}
              />
            )}
          </div>

          {/* Swap icon */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            paddingTop: "22px", color: "var(--accent-blue)", flexShrink: 0,
          }}>
            <SwapIcon />
          </div>

          {/* Product To Buy (receiving) */}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Product To Buy
            </label>
            <select
              value={productTo}
              onChange={(e) => setProductTo(e.target.value)}
              style={selectStyle}
            >
              {FULL_CYLINDER_PRODUCTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Purchase Price */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Purchase Price (₱)
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "var(--font-mono)",
            }}
          />
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
            onClick={onSubmit}
            style={{
              padding: "8px 20px", borderRadius: "8px", border: "none",
              cursor: "pointer",
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#fff", fontSize: "12px", fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            Record Swap
          </button>
        </div>
      </div>
    </div>
  );
}
