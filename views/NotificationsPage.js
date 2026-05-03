import React, { useState } from "react";
import { PlusIcon, TrashIcon, MailIcon, DollarIcon, DashboardIcon, PackageIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REPORTS = [
  {
    id: "daily-sales",
    name: "Daily Sales Report",
    description: "End-of-day summary of sales totals, broken down by product and payment method.",
    icon: <DollarIcon />,
  },
  {
    id: "sales-summary",
    name: "Sales Summary Report",
    description: "Periodic roll-up of sales performance, top-selling products, and revenue trends.",
    icon: <DashboardIcon />,
  },
  {
    id: "inventory",
    name: "Inventory Report",
    description: "Current stock levels and low-stock alerts across all products.",
    icon: <PackageIcon />,
  },
];

export default function NotificationsPage({ recipients, onAddRecipient, onRemoveRecipient }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const handleAdd = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Please enter an email address."); return; }
    if (!EMAIL_RE.test(trimmed)) { setError("That doesn't look like a valid email."); return; }
    if (recipients.some((r) => r.email === trimmed)) {
      setError("That email is already on the list.");
      return;
    }
    setError("");
    const ok = await onAddRecipient(trimmed);
    if (ok) setEmail("");
  };

  return (
    <div className="animate-fade">
      <div style={{
        marginBottom: "20px",
        padding: "14px 18px",
        borderRadius: "12px",
        background: "rgba(59,130,246,0.06)",
        border: "1px solid rgba(59,130,246,0.15)",
        display: "flex", alignItems: "center", gap: "12px",
      }}>
        <span style={{ color: "var(--accent-blue)", display: "flex" }}>
          <MailIcon />
        </span>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
          Email reports aren&apos;t sending yet.
          <span style={{ display: "block", color: "var(--text-dim)", fontSize: "11px", marginTop: "2px" }}>
            Add recipients now so they&apos;re ready to receive reports once we turn it on.
          </span>
        </p>
      </div>

      {/* Reports list */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{
          fontSize: "10px", fontWeight: 700, color: "var(--text-dim)",
          textTransform: "uppercase", letterSpacing: "1px",
          display: "block", marginBottom: "8px", paddingLeft: "2px",
        }}>
          Reports
        </label>
        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px",
            background: "rgba(15,23,42,0.03)",
            borderBottom: "1px solid var(--border)",
            fontSize: "11px", fontWeight: 600,
            color: "var(--text-muted)",
          }}>
            All reports are pending — sending hasn&apos;t been enabled yet.
          </div>
          {REPORTS.map((report, idx) => (
            <div
              key={report.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: "12px",
                padding: "14px 16px",
                borderBottom: idx < REPORTS.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none",
              }}
            >
              <span style={{
                color: "var(--accent-blue)", display: "flex",
                marginTop: "2px", flexShrink: 0,
              }}>
                {report.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "13px", fontWeight: 700,
                  color: "var(--text-secondary)", marginBottom: "2px",
                }}>
                  {report.name}
                </div>
                <div style={{
                  fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4,
                }}>
                  {report.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add form */}
      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", padding: "16px",
        marginBottom: "16px",
      }}>
        <label style={{
          fontSize: "10px", fontWeight: 700, color: "var(--text-dim)",
          textTransform: "uppercase", letterSpacing: "1px",
          display: "block", marginBottom: "6px",
        }}>
          Add Recipient
        </label>
        <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="manager@example.com"
            style={{
              flex: 1, padding: "10px 14px", borderRadius: "10px",
              background: "#fff", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "inherit", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              padding: "10px 18px", borderRadius: "10px", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              background: "var(--accent-blue)", color: "#fff",
              fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(37,99,235,0.3)", whiteSpace: "nowrap",
            }}
          >
            <PlusIcon /> Add
          </button>
        </div>
        {error && (
          <p style={{ fontSize: "11px", color: "#ef4444", marginTop: "8px", fontWeight: 600 }}>
            {error}
          </p>
        )}
      </div>

      {/* Recipient list */}
      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 80px",
          padding: "8px 14px", borderBottom: "1px solid var(--border)",
          fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          <span>Email</span>
          <span />
        </div>

        {recipients.length > 0 ? recipients.map((r) => (
          <div key={r.email} style={{
            display: "grid", gridTemplateColumns: "1fr 80px",
            padding: "10px 14px", alignItems: "center",
            borderBottom: "1px solid rgba(15,23,42,0.04)",
          }}>
            <span style={{
              fontSize: "13px", color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {r.email}
            </span>
            <button
              onClick={() => setPendingDelete(r)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-dim)", display: "flex", padding: "4px 6px",
                borderRadius: "6px", marginLeft: "auto",
              }}
              onMouseOver={(e) => e.currentTarget.style.color = "#ef4444"}
              onMouseOut={(e) => e.currentTarget.style.color = "var(--text-dim)"}
              title="Remove recipient"
            >
              <TrashIcon />
            </button>
          </div>
        )) : (
          <div style={{
            padding: "32px 16px", textAlign: "center",
            fontSize: "13px", color: "var(--text-muted)",
          }}>
            No recipients yet. Add one above to get started.
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Remove Recipient"
          message={`Remove "${pendingDelete.email}" from the notifications list?`}
          confirmLabel="Remove"
          onConfirm={async () => {
            await onRemoveRecipient(pendingDelete.email);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
