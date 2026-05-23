import React, { useState } from "react";
import { XIcon } from "./Icons";

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "8px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "12px", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

export default function AddCustomerModal({ onSubmit, onClose }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    if (!name.trim()) { setError("Customer name is required."); return; }
    onSubmit(name.trim(), phone.trim());
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
            Add Customer
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
            Name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Customer name"
            style={{ ...inputStyle, marginTop: "6px" }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Phone
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Phone number"
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
              padding: "8px 16px", borderRadius: "8px", border: "none",
              cursor: "pointer", fontSize: "12px", fontWeight: 600,
              color: "#fff", fontFamily: "inherit",
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
