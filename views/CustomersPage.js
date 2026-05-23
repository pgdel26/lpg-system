import React, { useState, useMemo } from "react";
import { fmt, formatDate } from "../lib/utils";
import { PlusIcon, PhoneIcon, EditIcon, TrashIcon, ChevronLeftIcon, HistoryIcon, DownloadIcon, SearchIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import AddCustomerModal from "../components/AddCustomerModal";
import ExportCustomerSalesModal from "../components/ExportCustomerSalesModal";

const TYPE_STYLES = {
  sale: { label: "Sale", bg: "rgba(16,185,129,0.08)", color: "#10b981" },
  swap: { label: "Swap", bg: "rgba(245,158,11,0.08)", color: "#f59e0b" },
  refund: { label: "Refund", bg: "rgba(239,68,68,0.08)", color: "#ef4444" },
};

export default function CustomersPage({
  customers,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onFetchCustomerTransactions,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  const startEdit = (cust) => {
    setEditingId(cust.id);
    setEditName(cust.name || "");
    setEditPhone(cust.phone || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    await onUpdateCustomer(editingId, { name: editName, phone: editPhone });
    setEditingId(null);
    setEditName("");
    setEditPhone("");
  };

  const askDelete = (cust) => setPendingDelete(cust);

  const openCustomer = async (cust) => {
    setSelectedCustomer(cust);
    setLoadingTx(true);
    const txs = await onFetchCustomerTransactions(cust.id);
    setTransactions(txs);
    setLoadingTx(false);
  };

  const closeDetail = () => {
    setSelectedCustomer(null);
    setTransactions([]);
  };

  const editInputStyle = {
    padding: "6px 10px", borderRadius: "6px",
    background: "rgba(255,255,255,0.9)", border: "1px solid var(--border-light)",
    color: "var(--text-secondary)", fontSize: "12px", outline: "none",
    fontFamily: "inherit",
  };

  const getTxDescription = (tx) => {
    if (tx.type === "sale") {
      return `${tx.product || "Item"} x${tx.quantity || 1}`;
    }
    if (tx.type === "swap") {
      return `${tx.productFrom || "?"} → ${tx.productTo || "?"}`;
    }
    if (tx.type === "refund") {
      return `${tx.product || tx.saleSection || "Refund"}${tx.quantity ? ` x${tx.quantity}` : ""}`;
    }
    return "";
  };

  const getTxAmount = (tx) => {
    if (tx.type === "sale") return tx.totalAmount || 0;
    if (tx.type === "swap") return tx.price || 0;
    if (tx.type === "refund") return tx.totalRefund || tx.refundAmount || 0;
    return 0;
  };

  // ---- Detail view ----
  if (selectedCustomer) {
    return (
      <div className="animate-fade">
        <button
          onClick={closeDetail}
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "4px",
            fontSize: "12px", color: "var(--accent-blue)", fontWeight: 600,
            fontFamily: "inherit", marginBottom: "16px", padding: 0,
          }}
        >
          <ChevronLeftIcon /> Back to Customers
        </button>

        {/* Customer info header */}
        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", padding: "20px",
          marginBottom: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                {selectedCustomer.name}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                <PhoneIcon />
                <span style={{ fontSize: "13px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {selectedCustomer.phone || "—"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(selectedCustomer); }}
                style={{
                  padding: "6px 14px", borderRadius: "8px",
                  border: "1px solid var(--border-light)", background: "transparent",
                  cursor: "pointer", fontSize: "11px", fontWeight: 600,
                  color: "var(--text-muted)", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <EditIcon /> Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); askDelete(selectedCustomer); }}
                style={{
                  padding: "6px 14px", borderRadius: "8px",
                  border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)",
                  cursor: "pointer", fontSize: "11px", fontWeight: 600,
                  color: "#ef4444", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <TrashIcon /> Delete
              </button>
            </div>
          </div>

          {/* Inline edit */}
          {editingId === selectedCustomer.id && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Name</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    autoFocus
                    style={{ ...editInputStyle, width: "100%" }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: "150px" }}>
                  <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Phone</span>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    style={{ ...editInputStyle, width: "100%" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "6px", alignSelf: "flex-end" }}>
                  <button onClick={cancelEdit} style={{
                    padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                    background: "transparent", cursor: "pointer", fontSize: "11px",
                    color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                  }}>Cancel</button>
                  <button onClick={saveEdit} style={{
                    padding: "6px 12px", borderRadius: "6px", border: "none",
                    background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                    color: "#fff", fontWeight: 600, fontFamily: "inherit",
                  }}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transaction history */}
        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", overflow: "hidden",
        }}>
          <div style={{
            padding: "14px 20px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <HistoryIcon />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Transaction History
            </span>
            {!loadingTx && (
              <span style={{ fontSize: "11px", color: "var(--text-dim)", marginLeft: "4px" }}>
                ({transactions.length})
              </span>
            )}
          </div>

          {loadingTx ? (
            <div style={{ padding: "30px 20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: "30px 20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
              No transactions found for this customer.
            </div>
          ) : (
            transactions.map((tx) => {
              const style = TYPE_STYLES[tx.type] || TYPE_STYLES.sale;
              return (
                <div key={tx.id} style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid rgba(15,23,42,0.04)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: "12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, padding: "2px 8px",
                      borderRadius: "4px", background: style.bg, color: style.color,
                      textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0,
                    }}>
                      {style.label}
                    </span>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getTxDescription(tx)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    <span style={{
                      fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)",
                      color: tx.type === "refund" ? "#f87171" : "var(--text-primary)",
                    }}>
                      {tx.type === "refund" ? "-" : ""}{fmt(getTxAmount(tx))}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      {tx.date || ""}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {pendingDelete && (
          <ConfirmModal
            title="Delete Customer"
            message={`Are you sure you want to delete "${pendingDelete.name}"? This will also delete all sales, swaps, and refunds linked to this customer. This action cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={() => { onDeleteCustomer(pendingDelete.id); setPendingDelete(null); closeDetail(); }}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="animate-fade">
      {/* Header: search + action buttons */}
      <div style={{
        display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap",
        marginBottom: "20px",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
          <span style={{
            position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
            display: "flex", alignItems: "center", color: "var(--text-dim)", pointerEvents: "none",
          }}>
            <SearchIcon />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name or phone..."
            style={{
              width: "100%", padding: "10px 12px 10px 34px", borderRadius: "10px",
              background: "var(--bg-card)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "13px", outline: "none",
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: "10px 18px", borderRadius: "10px", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            color: "#fff", fontSize: "12px", fontWeight: 700,
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          <PlusIcon /> Add Customer
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          style={{
            padding: "10px 18px", borderRadius: "10px",
            border: "1px solid rgba(37,99,235,0.25)",
            background: "rgba(37,99,235,0.06)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
            color: "var(--accent-blue)", fontSize: "12px", fontWeight: 700,
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          <DownloadIcon /> Export Customer Sales
        </button>
      </div>

      {/* Customer list */}
      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1.5fr 80px",
          padding: "10px 20px", borderBottom: "1px solid var(--border)",
          fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "1px",
        }}>
          <span>Name</span>
          <span>Phone</span>
          <span />
        </div>

        {customers.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
            No customers yet. Click &ldquo;Add Customer&rdquo; above.
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
            No customers match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          filteredCustomers.map((cust) => {
            if (editingId === cust.id) {
              return (
                <div key={cust.id} style={{
                  padding: "10px 20px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  background: "rgba(59,130,246,0.03)",
                }}>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "150px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Name</span>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                        autoFocus
                        style={{ ...editInputStyle, width: "100%" }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: "150px" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Phone</span>
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                        style={{ ...editInputStyle, width: "100%" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignSelf: "flex-end" }}>
                      <button onClick={cancelEdit} style={{
                        padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                        background: "transparent", cursor: "pointer", fontSize: "11px",
                        color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                      }}>Cancel</button>
                      <button onClick={saveEdit} style={{
                        padding: "6px 12px", borderRadius: "6px", border: "none",
                        background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                        color: "#fff", fontWeight: 600, fontFamily: "inherit",
                      }}>Save</button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={cust.id}
                onClick={() => openCustomer(cust)}
                style={{
                  display: "grid", gridTemplateColumns: "2fr 1.5fr 80px",
                  padding: "12px 20px", alignItems: "center",
                  borderBottom: "1px solid rgba(15,23,42,0.04)",
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(59,130,246,0.03)"}
                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
              >
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
                <div style={{ display: "flex", alignItems: "center", gap: "2px", justifyContent: "center" }}>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(cust); }} style={{
                    background: "none", border: "none", cursor: "pointer", padding: "4px",
                    color: "var(--text-dim)", display: "flex", alignItems: "center",
                  }} title="Edit">
                    <EditIcon />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); askDelete(cust); }} style={{
                    background: "none", border: "none", cursor: "pointer", padding: "4px",
                    color: "var(--text-dim)", display: "flex", alignItems: "center",
                  }} title="Delete">
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Delete Customer"
          message={`Are you sure you want to delete "${pendingDelete.name}"? This will also delete all sales, swaps, and refunds linked to this customer. This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeleteCustomer(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {showAddModal && (
        <AddCustomerModal
          onSubmit={(name, phone) => onAddCustomer(name, phone)}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showExportModal && (
        <ExportCustomerSalesModal
          customers={customers}
          onFetchCustomerTransactions={onFetchCustomerTransactions}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
