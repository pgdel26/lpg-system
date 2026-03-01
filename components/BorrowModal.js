import React from "react";
import { XIcon } from "./Icons";
import { fmt, formatDate } from "../lib/utils";
import { BORROWED_PRODUCTS } from "../lib/constants";
import CustomerSearch from "./CustomerSearch";

// "add" mode
export function BorrowAddModal({
  customer, setCustomer,
  newCustomer, setNewCustomer,
  newName, setNewName,
  newPhone, setNewPhone,
  product, setProduct,
  error, setError,
  customers, products,
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
        width: "100%", maxWidth: "420px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Add Borrowed Item</h3>
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
              Customer *
            </label>
            <button
              onClick={() => {
                setNewCustomer(!newCustomer);
                setCustomer("");
                setNewName("");
                setNewPhone("");
                setError("");
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
              onChange={(id) => { setCustomer(id); setError(""); }}
            />
          )}
        </div>

        {/* Product select */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product *</label>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "8px",
              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "inherit",
            }}
          >
            {BORROWED_PRODUCTS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* SRP display */}
        {product && (() => {
          const prod = products[`borrowed_${product}`];
          const srp = prod?.srp || 0;
          return (
            <div style={{
              padding: "10px 14px", borderRadius: "8px", marginBottom: "14px",
              background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Borrow Price</span>
              <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>{fmt(srp)}</span>
            </div>
          );
        })()}

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
            Record Borrow
          </button>
        </div>
      </div>
    </div>
  );
}

// "view" mode
export function BorrowViewModal({
  product, products, borrows,
  onClose, onReturn,
}) {
  const prodKey = `borrowed_${product}`;
  const prod = products[prodKey];
  const srp = prod?.srp || 0;
  const activeBorrows = borrows.filter((b) => b.product === product && !b.returned);

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
        width: "100%", maxWidth: "460px", maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>{product}</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>
        <div style={{
          padding: "8px 12px", borderRadius: "8px", marginBottom: "18px",
          background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Borrow Price</span>
          <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>{fmt(srp)}</span>
        </div>

        <h4 style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
          Customers with this item ({activeBorrows.length})
        </h4>
        {activeBorrows.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--text-dim)", padding: "8px 0" }}>No customers currently have this item borrowed.</p>
        ) : (
          <div style={{ borderRadius: "10px", border: "1px solid var(--border)", overflow: "hidden" }}>
            {activeBorrows.map((b) => (
              <div key={b.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
              }}>
                <div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>{b.customerName}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "8px" }}>{formatDate(b.createdAt)}</span>
                </div>
                <button
                  onClick={() => onReturn(b.id)}
                  style={{
                    padding: "5px 12px", borderRadius: "6px", border: "none", cursor: "pointer",
                    background: "rgba(34,197,94,0.12)", color: "#4ade80",
                    fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                  }}
                >
                  Mark Returned
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
