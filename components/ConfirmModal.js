import React from "react";
import { XIcon } from "./Icons";

export default function ConfirmModal({ title, message, confirmLabel, confirmColor, onConfirm, onCancel }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: "16px",
        border: "1px solid var(--border)", padding: "24px",
        width: "100%", maxWidth: "400px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
            {title || "Confirm"}
          </h3>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>

        <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "20px" }}>
          {message}
        </p>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
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
            onClick={onConfirm}
            style={{
              padding: "8px 16px", borderRadius: "8px", border: "none",
              cursor: "pointer", fontSize: "12px", fontWeight: 600,
              color: "#fff", fontFamily: "inherit",
              background: confirmColor || "linear-gradient(135deg, #ef4444, #dc2626)",
            }}
          >
            {confirmLabel || "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
