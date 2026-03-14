import React, { useState } from "react";
import { XIcon } from "./Icons";

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "8px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "12px", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

export default function ExpenseModal({ onSubmit, onClose }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    if (!description.trim()) { setError("Please enter a description."); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setError("Please enter a valid amount."); return; }
    onSubmit(description, parsed);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: "16px",
        border: "1px solid var(--border)", padding: "24px",
        width: "100%", maxWidth: "400px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
            Add Expense
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Description
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Gas, Load, Supplies"
            style={{ ...inputStyle, marginTop: "6px" }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            style={{ ...inputStyle, marginTop: "6px", fontFamily: "var(--font-mono)" }}
          />
        </div>

        {error && (
          <p style={{ fontSize: "11px", color: "var(--accent-red)", marginBottom: "12px", fontWeight: 600 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: "8px",
              border: "1px solid var(--border-light)", background: "transparent",
              cursor: "pointer", fontSize: "12px", fontWeight: 600,
              color: "var(--text-muted)", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 20px", borderRadius: "8px", border: "none",
              cursor: "pointer", fontSize: "12px", fontWeight: 700,
              color: "#fff", fontFamily: "inherit",
              background: "var(--accent-blue)",
              boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
            }}
          >
            Add Expense
          </button>
        </div>
      </div>
    </div>
  );
}
