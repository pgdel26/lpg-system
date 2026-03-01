import React from "react";
import { formatDate } from "../lib/utils";
import { PlusIcon, PhoneIcon } from "../components/Icons";

export default function CustomersPage({
  customers,
  formName, setFormName,
  formPhone, setFormPhone,
  onAddCustomer,
}) {
  return (
    <div className="animate-fade">
      {/* Add customer form */}
      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", padding: "20px",
        marginBottom: "24px",
      }}>
        <h3 style={{
          fontSize: "12px", fontWeight: 700, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px",
        }}>
          Add New Customer
        </h3>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "180px" }}>
            <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>Name *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Customer name"
              onKeyDown={(e) => { if (e.key === "Enter") onAddCustomer(); }}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "8px",
                background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                color: "var(--text-secondary)", fontSize: "13px", outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: "180px" }}>
            <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px" }}>Phone</label>
            <input
              type="text"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="Phone number"
              onKeyDown={(e) => { if (e.key === "Enter") onAddCustomer(); }}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "8px",
                background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                color: "var(--text-secondary)", fontSize: "13px", outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
          <button
            onClick={onAddCustomer}
            style={{
              padding: "8px 18px", borderRadius: "8px", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#fff", fontSize: "12px", fontWeight: 700,
              fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            <PlusIcon /> Add Customer
          </button>
        </div>
      </div>

      {/* Customer list */}
      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1.5fr",
          padding: "10px 20px", borderBottom: "1px solid var(--border)",
          fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "1px",
        }}>
          <span>Name</span>
          <span>Phone</span>
        </div>

        {customers.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
            No customers yet. Add one above.
          </div>
        ) : (
          customers.map((cust) => (
              <div key={cust.id} style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr",
                padding: "12px 20px", alignItems: "center",
                borderBottom: "1px solid rgba(15,23,42,0.04)",
              }}>
                <div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    {cust.name}
                  </span>
                  {cust.createdAt && (
                    <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "8px" }}>
                      Added {formatDate(cust.createdAt)}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <PhoneIcon />
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {cust.phone || "—"}
                  </span>
                </div>
              </div>
          ))
        )}
      </div>
    </div>
  );
}
