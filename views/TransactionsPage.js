import React, { useState } from "react";
import * as XLSX from "xlsx";
import { fmt, today } from "../lib/utils";
import { PlusIcon, SwapIcon, HistoryIcon, EditIcon, TrashIcon, DownloadIcon, XIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import ExpenseModal from "../components/ExpenseModal";
import RefundsPage from "./RefundsPage";

export default function TransactionsPage({
  inventoryDate, setInventoryDate,
  saleTransactions, swaps, refunds,
  expenses,
  staff, dailyReport, onUpdateDailyStaff,
  allRefunds,
  onOpenSaleModal, onOpenSwapModal, onOpenRefundModal,
  onUpdateSale, onUpdateSwap, onUpdateRefund,
  onDeleteSale, onDeleteSwap, onDeleteRefund,
  onAddExpense, onUpdateExpense, onDeleteExpense,
}) {
  const [subTab, setSubTab] = useState("report");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [showAddStaffDropdown, setShowAddStaffDropdown] = useState(false);

  const saleTypeLabel = (section) => {
    if (section === "cylinderWithRefill") return "Full Cylinder";
    if (section === "refill") return "Refill";
    if (section === "accessories") return "Accessories";
    return section;
  };

  const sorted = [...saleTransactions].sort((a, b) => {
    const invA = (a.invoice || "").toLowerCase();
    const invB = (b.invoice || "").toLowerCase();
    if (invA !== invB) return invA.localeCompare(invB);
    const tA = a.createdAt?.seconds || 0;
    const tB = b.createdAt?.seconds || 0;
    return tA - tB;
  });

  const totalRevenue = sorted.reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
  const swapTotal = swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const refundTotal = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const grandTotal = totalRevenue + swapTotal - refundTotal;

  const exportSales = () => {
    const rows = sorted.map((t) => ({
      "Invoice": t.invoice || "",
      "Customer": t.customerName || "",
      "Product": t.product || "",
      "Type": saleTypeLabel(t.saleSection),
      "Qty": t.quantity || 1,
      "SRP": t.srp || 0,
      "Discount": t.discount || 0,
      "Total": t.totalAmount || t.finalPrice || 0,
      "Payment": t.paymentType === "cash" ? "Cash" : "AR",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, `Sales_${inventoryDate}.xlsx`);
  };

  const startEdit = (type, item) => {
    setEditingId(`${type}_${item.id}`);
    if (type === "sale") {
      setEditData({
        type: "sale",
        id: item.id,
        invoice: item.invoice || "",
        customerName: item.customerName || "",
        discount: item.discount || 0,
        totalAmount: item.totalAmount || item.finalPrice || 0,
        paymentType: item.paymentType || "cash",
        srp: item.srp || 0,
        quantity: item.quantity || 1,
      });
    } else if (type === "swap") {
      setEditData({
        type: "swap",
        id: item.id,
        productFrom: item.productFrom || "",
        productTo: item.productTo || "",
        price: item.price || 0,
      });
    } else if (type === "refund") {
      setEditData({
        type: "refund",
        id: item.id,
        invoice: item.invoice || "",
        customerName: item.customerName || "",
        reason: item.reason || "",
        totalRefund: item.totalRefund || 0,
        items: (item.items || []).map((it) => ({ ...it })),
      });
    }
  };

  const cancelEdit = () => { setEditingId(null); setEditData(null); };

  const saveEdit = async () => {
    if (!editData) return;
    if (editData.type === "sale") {
      await onUpdateSale(editData.id, editData);
    } else if (editData.type === "swap") {
      await onUpdateSwap(editData.id, editData);
    } else if (editData.type === "refund") {
      const totalRefund = editData.items.reduce((sum, it) => sum + (parseFloat(it.value) || 0), 0);
      await onUpdateRefund(editData.id, { ...editData, totalRefund });
    }
    setEditingId(null);
    setEditData(null);
  };

  const editInputStyle = {
    padding: "4px 8px", borderRadius: "6px",
    background: "rgba(255,255,255,0.9)", border: "1px solid var(--border-light)",
    color: "var(--text-secondary)", fontSize: "11px", outline: "none",
    fontFamily: "inherit",
  };

  const subTabs = [
    { key: "report", label: "Sales Report" },
    { key: "sales", label: "Daily Sales" },
    { key: "refunds", label: "Refunds / Returns" },
  ];

  return (
    <div className="animate-fade">

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: "0", marginBottom: "0" }}>
        {subTabs.map((tab) => {
          const isActive = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              style={{
                padding: "10px 24px", cursor: "pointer",
                fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
                borderRadius: "0",
                border: "1px solid rgba(200,210,220,0.5)",
                borderBottom: isActive ? "1px solid var(--bg-card)" : "1px solid rgba(200,210,220,0.5)",
                background: isActive ? "var(--bg-card)" : "transparent",
                color: isActive ? "var(--accent-blue)" : "var(--text-dim)",
                position: "relative",
                zIndex: isActive ? 1 : 0,
                marginBottom: "-1px",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{
        background: "var(--bg-card)", borderRadius: "0 0 0 0",
        border: "1px solid var(--border)", padding: "24px",
      }}>

      {/* ===== SALES REPORT SUB-TAB ===== */}
      {subTab === "report" && (() => {
        const grossSales = saleTransactions.reduce((sum, t) => sum + ((t.srp || 0) * (t.quantity || 1)), 0)
          + swaps.reduce((sum, s) => sum + (s.price || 0), 0);
        const totalDiscount = saleTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
        const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
        const totalRefunds = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);
        const netSales = grossSales - totalDiscount - totalExpenses - totalRefunds;
        const totalAR = saleTransactions.filter((t) => t.paymentType === "ar").reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
        const expectedCashRemit = netSales - totalAR;

        return (
          <div>
            {/* Date selector */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <input
                type="date"
                value={inventoryDate}
                onChange={(e) => setInventoryDate(e.target.value)}
                style={{
                  padding: "8px 12px", borderRadius: "8px",
                  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)", fontSize: "13px",
                  fontFamily: "var(--font-mono)", outline: "none",
                }}
              />
              {inventoryDate !== today() && (
                <button
                  onClick={() => setInventoryDate(today())}
                  style={{
                    padding: "8px 14px", borderRadius: "8px", border: "none",
                    cursor: "pointer", background: "rgba(37,99,235,0.1)",
                    color: "var(--accent-blue)", fontSize: "12px", fontWeight: 600,
                    fontFamily: "inherit",
                  }}
                >
                  Go to Today
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
              {/* Left: Report summary */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Breakdown table */}
                <div style={{
                  background: "var(--bg-card)", borderRadius: "12px",
                  border: "1px solid var(--border)", overflow: "hidden",
                }}>
                  <div style={{
                    padding: "12px 20px", borderBottom: "1px solid var(--border)",
                    fontSize: "12px", fontWeight: 700, color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.5px",
                  }}>
                    Daily Breakdown
                  </div>

                  {/* Gross Sales row */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 20px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Gross Sales</div>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                        {saleTransactions.length} sale{saleTransactions.length !== 1 ? "s" : ""} + {swaps.length} swap{swaps.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-green)" }}>
                      {fmt(grossSales)}
                    </span>
                  </div>

                  {/* Discount row */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 20px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Discounts</div>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                        {saleTransactions.filter((t) => t.discount > 0).length} discounted sale{saleTransactions.filter((t) => t.discount > 0).length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: totalDiscount > 0 ? "var(--accent-red)" : "var(--text-dim)" }}>
                      {totalDiscount > 0 ? `- ${fmt(totalDiscount)}` : fmt(0)}
                    </span>
                  </div>

                  {/* Expenses row */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 20px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Expenses</div>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                        {(expenses || []).length} expense{(expenses || []).length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: totalExpenses > 0 ? "var(--accent-red)" : "var(--text-dim)" }}>
                      {totalExpenses > 0 ? `- ${fmt(totalExpenses)}` : fmt(0)}
                    </span>
                  </div>

                  {/* Refunds row */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 20px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Refunds</div>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                        {(refunds || []).length} refund{(refunds || []).length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: totalRefunds > 0 ? "var(--accent-red)" : "var(--text-dim)" }}>
                      {totalRefunds > 0 ? `- ${fmt(totalRefunds)}` : fmt(0)}
                    </span>
                  </div>

                  {/* Net Sales total */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 20px",
                    background: "rgba(241,245,249,0.5)", borderTop: "1px solid var(--border)",
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Net Sales
                    </span>
                    <span style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: netSales >= 0 ? "var(--accent-gold)" : "var(--accent-red)" }}>
                      {fmt(netSales)}
                    </span>
                  </div>

                  {/* Accounts Receivable row */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 20px", borderTop: "1px solid rgba(15,23,42,0.04)",
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Accounts Receivable</div>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                        {saleTransactions.filter((t) => t.paymentType === "ar").length} AR sale{saleTransactions.filter((t) => t.paymentType === "ar").length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: totalAR > 0 ? "var(--accent-orange)" : "var(--text-dim)" }}>
                      {totalAR > 0 ? `- ${fmt(totalAR)}` : fmt(0)}
                    </span>
                  </div>

                  {/* Expected Cash Remit */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 20px",
                    background: "rgba(34,197,94,0.06)", borderTop: "1px solid var(--border)",
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Expected Cash Remit
                    </span>
                    <span style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: expectedCashRemit >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {fmt(expectedCashRemit)}
                    </span>
                  </div>

                  {/* Actual Cash Remit */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 20px", borderTop: "1px solid rgba(15,23,42,0.04)",
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Actual Cash Remit
                    </span>
                    <input
                      type="number"
                      value={dailyReport?.actualCashRemit ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateDailyStaff({ ...dailyReport, actualCashRemit: val === "" ? null : parseFloat(val) });
                      }}
                      placeholder="0"
                      style={{
                        width: "140px", padding: "6px 10px", borderRadius: "6px",
                        background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                        color: "var(--text-secondary)", fontSize: "14px", outline: "none",
                        fontFamily: "var(--font-mono)", textAlign: "right", fontWeight: 700,
                      }}
                    />
                  </div>

                  {/* Short / Over */}
                  {(() => {
                    const actual = parseFloat(dailyReport?.actualCashRemit) || 0;
                    const diff = actual - expectedCashRemit;
                    const isOver = diff > 0;
                    const isShort = diff < 0;
                    return (
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "14px 20px",
                        background: isShort ? "rgba(239,68,68,0.06)" : isOver ? "rgba(34,197,94,0.06)" : "rgba(241,245,249,0.5)",
                        borderTop: "1px solid var(--border)",
                      }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          {isShort ? "Short" : isOver ? "Over" : "Short / Over"}
                        </span>
                        <span style={{
                          fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)",
                          color: isShort ? "var(--accent-red)" : isOver ? "var(--accent-green)" : "var(--text-dim)",
                        }}>
                          {isShort ? `- ${fmt(Math.abs(diff))}` : isOver ? `+ ${fmt(diff)}` : fmt(0)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right: Staff + Expenses panels */}
              <div style={{ width: "340px", flexShrink: 0 }}>

                {/* Staff on Duty */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }} />
                    <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Staff on Duty
                    </h3>
                  </div>

                  <div style={{
                    background: "var(--bg-card)", borderRadius: "12px",
                    border: "1px solid var(--border)", padding: "12px 14px",
                  }}>
                    {/* Cashier */}
                    <div style={{ marginBottom: "10px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Cashier
                      </span>
                      <select
                        value={dailyReport?.cashier || ""}
                        onChange={(e) => onUpdateDailyStaff({ ...dailyReport, cashier: e.target.value || null })}
                        style={{
                          width: "100%", padding: "6px 8px", borderRadius: "6px", marginTop: "4px",
                          background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                          color: "var(--text-secondary)", fontSize: "12px", outline: "none",
                          fontFamily: "inherit", cursor: "pointer",
                        }}
                      >
                        <option value="">-- Select cashier --</option>
                        {(staff || []).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ""}</option>
                        ))}
                      </select>
                    </div>

                    {/* Staff */}
                    <div>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Staff
                      </span>
                      {/* Assigned staff list */}
                      <div style={{ marginTop: "4px" }}>
                        {(dailyReport?.staff || []).map((id) => {
                          const s = (staff || []).find((st) => st.id === id);
                          if (!s) return null;
                          return (
                            <div key={s.id} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "4px 0",
                            }}>
                              <div>
                                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
                                  {s.name}
                                </span>
                                {s.role && (
                                  <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "6px" }}>({s.role})</span>
                                )}
                              </div>
                              <button onClick={() => {
                                const updated = (dailyReport?.staff || []).filter((sid) => sid !== s.id);
                                onUpdateDailyStaff({ ...dailyReport, staff: updated });
                              }} style={{
                                background: "none", border: "none", cursor: "pointer", padding: "2px",
                                color: "var(--text-dim)", display: "flex", alignItems: "center",
                                fontSize: "11px",
                              }} title="Remove">
                                <XIcon />
                              </button>
                            </div>
                          );
                        })}
                        {(dailyReport?.staff || []).length === 0 && (
                          <div style={{ fontSize: "11px", color: "var(--text-dim)", padding: "4px 0" }}>
                            No staff assigned.
                          </div>
                        )}
                      </div>

                      {/* Add staff dropdown */}
                      {(() => {
                        const assignedIds = dailyReport?.staff || [];
                        const available = (staff || []).filter((s) => !assignedIds.includes(s.id));
                        return (
                          <select
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              onUpdateDailyStaff({ ...dailyReport, staff: [...assignedIds, e.target.value] });
                            }}
                            disabled={available.length === 0}
                            style={{
                              width: "100%", padding: "6px 8px", borderRadius: "6px", marginTop: "6px",
                              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                              color: "var(--text-secondary)", fontSize: "12px", outline: "none",
                              fontFamily: "inherit", cursor: available.length === 0 ? "default" : "pointer",
                              opacity: available.length === 0 ? 0.5 : 1,
                            }}
                          >
                            <option value="">{available.length === 0 ? "All staff assigned" : "+ Add staff..."}</option>
                            {available.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ""}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Expenses */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e42" }} />
                      <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Expenses
                      </h3>
                    </div>
                    <button
                      onClick={() => setExpenseModalOpen(true)}
                      style={{
                        padding: "5px 10px", borderRadius: "6px", border: "none",
                        cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                        background: "rgba(245,158,66,0.12)", color: "#f59e42",
                        fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                      }}
                    >
                      New
                    </button>
                  </div>

                  <div style={{
                    background: "var(--bg-card)", borderRadius: "12px",
                    border: "1px solid var(--border)", overflow: "hidden",
                  }}>
                    {(expenses || []).length > 0 ? (expenses || []).map((e) => {
                      const isEditing = editingId === `expense_${e.id}`;

                      if (isEditing && editData) {
                        return (
                          <div key={e.id} style={{
                            padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                            background: "rgba(245,158,66,0.03)",
                          }}>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Description</span>
                                <input value={editData.description} onChange={(ev) => setEditData((p) => ({ ...p, description: ev.target.value }))}
                                  style={{ ...editInputStyle, width: "100%", display: "block" }} />
                              </div>
                              <div>
                                <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Amount</span>
                                <input type="number" value={editData.amount} onChange={(ev) => setEditData((p) => ({ ...p, amount: ev.target.value }))}
                                  style={{ ...editInputStyle, width: "80px", display: "block", fontFamily: "var(--font-mono)" }} />
                              </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                              <button onClick={cancelEdit} style={{
                                padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                                background: "transparent", cursor: "pointer", fontSize: "11px",
                                color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                              }}>Cancel</button>
                              <button onClick={() => { onUpdateExpense(editData.id, editData); cancelEdit(); }} style={{
                                padding: "4px 12px", borderRadius: "6px", border: "none",
                                background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                                color: "#fff", fontWeight: 600, fontFamily: "inherit",
                              }}>Save</button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={e.id} style={{
                          padding: "8px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600 }}>
                              {e.description}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-orange)" }}>
                                {fmt(e.amount)}
                              </span>
                              <button onClick={() => { setEditingId(`expense_${e.id}`); setEditData({ type: "expense", id: e.id, description: e.description, amount: e.amount }); }} style={{
                                background: "none", border: "none", cursor: "pointer", padding: "2px",
                                color: "var(--text-dim)", display: "flex", alignItems: "center",
                              }} title="Edit">
                                <EditIcon />
                              </button>
                              <button onClick={() => setPendingDelete({ type: "expense", id: e.id })} style={{
                                background: "none", border: "none", cursor: "pointer", padding: "2px",
                                color: "var(--text-dim)", display: "flex", alignItems: "center",
                              }} title="Delete">
                                <TrashIcon />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div style={{ padding: "12px 14px", textAlign: "center", fontSize: "11px", color: "var(--text-dim)" }}>
                        No expenses recorded today.
                      </div>
                    )}
                    {(expenses || []).length > 0 && (
                      <div style={{
                        padding: "8px 14px", borderTop: "1px solid var(--border)",
                        background: "rgba(241,245,249,0.5)",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>Total</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-orange)", fontSize: "12px" }}>
                          {fmt(totalExpenses)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {expenseModalOpen && (
              <ExpenseModal
                onSubmit={onAddExpense}
                onClose={() => setExpenseModalOpen(false)}
              />
            )}
          </div>
        );
      })()}

      {/* ===== SALES SUB-TAB ===== */}
      {subTab === "sales" && (
      <div>
      {/* Date selector + Record Sale button */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          type="date"
          value={inventoryDate}
          onChange={(e) => setInventoryDate(e.target.value)}
          style={{
            padding: "8px 12px", borderRadius: "8px",
            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
            color: "var(--text-secondary)", fontSize: "13px",
            fontFamily: "var(--font-mono)", outline: "none",
          }}
        />
        {inventoryDate !== today() && (
          <button
            onClick={() => setInventoryDate(today())}
            style={{
              padding: "8px 14px", borderRadius: "8px", border: "none",
              cursor: "pointer", background: "rgba(37,99,235,0.1)",
              color: "var(--accent-blue)", fontSize: "12px", fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            Go to Today
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button
            onClick={exportSales}
            disabled={sorted.length === 0}
            style={{
              padding: "10px 16px", borderRadius: "10px",
              border: "1px solid var(--border-light)", background: "transparent",
              cursor: sorted.length === 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: "6px",
              color: sorted.length === 0 ? "var(--text-dim)" : "var(--text-muted)",
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
              opacity: sorted.length === 0 ? 0.5 : 1,
            }}
          >
            <DownloadIcon /> Export
          </button>
          <button
            onClick={() => onOpenSaleModal()}
            style={{
              padding: "10px 20px", borderRadius: "10px", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              background: "var(--accent-blue)", color: "#fff",
              fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
            }}
          >
            <PlusIcon /> Add Sale
          </button>
        </div>
      </div>

      {/* Grand total card */}
      <div style={{
        padding: "16px 20px", borderRadius: "12px", marginBottom: "20px",
        background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(37,99,235,0.04))",
        border: "1px solid rgba(37,99,235,0.12)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Total Sales
        </span>
        <span style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
          {fmt(grandTotal)}
        </span>
      </div>

      {/* Main layout: Sales table + side panels */}
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>

      {/* Sales transactions table */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
          Sales
        </h3>
        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", overflow: "hidden",
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: "36px 1fr 1.2fr 1.2fr 0.8fr 0.5fr 0.8fr 0.7fr 0.8fr 0.7fr 52px",
            padding: "8px 14px", borderBottom: "1px solid var(--border)",
            fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            <span>#</span>
            <span>Invoice</span>
            <span>Customer</span>
            <span>Product</span>
            <span>Type</span>
            <span style={{ textAlign: "center" }}>Qty</span>
            <span style={{ textAlign: "right" }}>SRP</span>
            <span style={{ textAlign: "right" }}>Disc.</span>
            <span style={{ textAlign: "right" }}>Final</span>
            <span style={{ textAlign: "center" }}>Pay</span>
            <span />
          </div>

          {sorted.length > 0 ? sorted.map((t, i) => {
            const isEditing = editingId === `sale_${t.id}`;

            if (isEditing && editData) {
              return (
                <div key={t.id} style={{
                  padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  background: "rgba(59,130,246,0.03)",
                }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Invoice</span>
                      <input value={editData.invoice} onChange={(e) => setEditData((p) => ({ ...p, invoice: e.target.value }))}
                        style={{ ...editInputStyle, width: "100px", display: "block" }} />
                    </div>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Customer</span>
                      <input value={editData.customerName} onChange={(e) => setEditData((p) => ({ ...p, customerName: e.target.value }))}
                        style={{ ...editInputStyle, width: "140px", display: "block" }} />
                    </div>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Discount</span>
                      <input type="number" value={editData.discount} onChange={(e) => {
                        const disc = parseFloat(e.target.value) || 0;
                        setEditData((p) => ({ ...p, discount: disc, totalAmount: Math.max(0, (p.srp * p.quantity) - disc) }));
                      }} style={{ ...editInputStyle, width: "80px", display: "block", fontFamily: "var(--font-mono)" }} />
                    </div>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Payment</span>
                      <select value={editData.paymentType} onChange={(e) => setEditData((p) => ({ ...p, paymentType: e.target.value }))}
                        style={{ ...editInputStyle, display: "block", cursor: "pointer" }}>
                        <option value="cash">Cash</option>
                        <option value="ar">AR</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)" }}>
                      Total: {fmt(editData.totalAmount)}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={cancelEdit} style={{
                        padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                        background: "transparent", cursor: "pointer", fontSize: "11px",
                        color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                      }}>Cancel</button>
                      <button onClick={saveEdit} style={{
                        padding: "4px 12px", borderRadius: "6px", border: "none",
                        background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                        color: "#fff", fontWeight: 600, fontFamily: "inherit",
                      }}>Save</button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={t.id} style={{
                display: "grid", gridTemplateColumns: "36px 1fr 1.2fr 1.2fr 0.8fr 0.5fr 0.8fr 0.7fr 0.8fr 0.7fr 52px",
                padding: "8px 14px", alignItems: "center",
                borderBottom: "1px solid rgba(15,23,42,0.04)",
                fontSize: "12px",
              }}>
                <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>{i + 1}</span>
                <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{t.invoice || "\u2014"}</span>
                <span style={{ color: "var(--text-secondary)" }}>{t.customerName || "\u2014"}</span>
                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{t.product}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>{saleTypeLabel(t.saleSection)}</span>
                <span style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", fontSize: "11px" }}>{t.quantity || 1}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "11px" }}>{fmt(t.srp || 0)}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: t.discount > 0 ? "var(--accent-red)" : "var(--text-dim)", fontSize: "11px" }}>
                  {t.discount > 0 ? `-${fmt(t.discount)}` : "\u2014"}
                </span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)", fontSize: "12px" }}>
                  {fmt(t.totalAmount || t.finalPrice || 0)}
                </span>
                <span style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700,
                    background: t.paymentType === "cash" ? "rgba(34,197,94,0.1)" : "rgba(245,158,66,0.1)",
                    color: t.paymentType === "cash" ? "var(--accent-green)" : "var(--accent-orange)",
                  }}>
                    {t.paymentType === "cash" ? "Cash" : "AR"}
                  </span>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "2px", justifyContent: "center" }}>
                  <button onClick={() => startEdit("sale", t)} style={{
                    background: "none", border: "none", cursor: "pointer", padding: "2px",
                    color: "var(--text-dim)", display: "flex", alignItems: "center",
                  }} title="Edit">
                    <EditIcon />
                  </button>
                  <button onClick={() => setPendingDelete({ type: "sale", id: t.id })} style={{
                    background: "none", border: "none", cursor: "pointer", padding: "2px",
                    color: "var(--text-dim)", display: "flex", alignItems: "center",
                  }} title="Delete">
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          }) : (
            <div style={{ padding: "20px 14px", textAlign: "center", fontSize: "12px", color: "var(--text-dim)" }}>
              No sales transactions recorded today.
            </div>
          )}

          {sorted.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "36px 1fr 1.2fr 1.2fr 0.8fr 0.8fr 0.7fr 0.8fr 0.7fr 52px",
              padding: "10px 14px", borderTop: "1px solid var(--border)",
              background: "rgba(241,245,249,0.5)",
            }}>
              <span /><span /><span /><span /><span /><span />
              <span style={{ textAlign: "right", fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>Total</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)", fontSize: "13px" }}>
                {fmt(totalRevenue)}
              </span>
              <span /><span />
            </div>
          )}
        </div>
      </div>

      {/* Side panel: Swap + Refund */}
      <div style={{ width: "400px", flexShrink: 0 }}>

      {/* Upgrade / Swap section */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }} />
            <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Upgrade / Swap
            </h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={onOpenSwapModal}
              style={{
                padding: "5px 10px", borderRadius: "6px", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                background: "rgba(59,130,246,0.12)", color: "#60a5fa",
                fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
              }}
            >
              New
            </button>
          </div>
        </div>

        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", overflow: "hidden",
        }}>
          {swaps.length > 0 ? swaps.map((s) => {
            const isEditing = editingId === `swap_${s.id}`;

            if (isEditing && editData) {
              return (
                <div key={s.id} style={{
                  padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  background: "rgba(59,130,246,0.03)",
                }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>From</span>
                      <input value={editData.productFrom} onChange={(e) => setEditData((p) => ({ ...p, productFrom: e.target.value }))}
                        style={{ ...editInputStyle, width: "140px", display: "block" }} />
                    </div>
                    <span style={{ color: "var(--text-dim)", marginTop: "12px" }}>&rarr;</span>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>To</span>
                      <input value={editData.productTo} onChange={(e) => setEditData((p) => ({ ...p, productTo: e.target.value }))}
                        style={{ ...editInputStyle, width: "140px", display: "block" }} />
                    </div>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Price</span>
                      <input type="number" value={editData.price} onChange={(e) => setEditData((p) => ({ ...p, price: e.target.value }))}
                        style={{ ...editInputStyle, width: "80px", display: "block", fontFamily: "var(--font-mono)" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                    <button onClick={cancelEdit} style={{
                      padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                      background: "transparent", cursor: "pointer", fontSize: "11px",
                      color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                    }}>Cancel</button>
                    <button onClick={saveEdit} style={{
                      padding: "4px 12px", borderRadius: "6px", border: "none",
                      background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                      color: "#fff", fontWeight: 600, fontFamily: "inherit",
                    }}>Save</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={s.id} style={{
                padding: "8px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    <span style={{ fontWeight: 600 }}>{s.productFrom}</span>
                    <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>&rarr;</span>
                    <span style={{ fontWeight: 600 }}>{s.productTo}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                      {fmt(s.price)}
                    </span>
                    <button onClick={() => startEdit("swap", s)} style={{
                      background: "none", border: "none", cursor: "pointer", padding: "2px",
                      color: "var(--text-dim)", display: "flex", alignItems: "center",
                    }} title="Edit">
                      <EditIcon />
                    </button>
                    <button onClick={() => setPendingDelete({ type: "swap", id: s.id })} style={{
                      background: "none", border: "none", cursor: "pointer", padding: "2px",
                      color: "var(--text-dim)", display: "flex", alignItems: "center",
                    }} title="Delete">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div style={{ padding: "12px 14px", textAlign: "center", fontSize: "11px", color: "var(--text-dim)" }}>
              No swaps recorded today.
            </div>
          )}
          {swaps.length > 0 && (
            <div style={{
              padding: "8px 14px", borderTop: "1px solid var(--border)",
              background: "rgba(241,245,249,0.5)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>Total</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-gold)", fontSize: "12px" }}>
                {fmt(swapTotal)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Refund / Return section */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444" }} />
            <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Refund / Return
            </h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={onOpenRefundModal}
              style={{
                padding: "5px 10px", borderRadius: "6px", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                background: "rgba(239,68,68,0.12)", color: "#f87171",
                fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
              }}
            >
              New
            </button>
          </div>
        </div>

        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", overflow: "hidden",
        }}>
          {(refunds || []).length > 0 ? (refunds || []).map((r) => {
            const isEditing = editingId === `refund_${r.id}`;

            if (isEditing && editData) {
              const editTotal = editData.items.reduce((sum, it) => sum + (parseFloat(it.value) || 0), 0);
              return (
                <div key={r.id} style={{
                  padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                  background: "rgba(239,68,68,0.03)",
                }}>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Invoice</span>
                      <input value={editData.invoice} onChange={(e) => setEditData((p) => ({ ...p, invoice: e.target.value }))}
                        style={{ ...editInputStyle, width: "100px", display: "block" }} />
                    </div>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Customer</span>
                      <input value={editData.customerName} onChange={(e) => setEditData((p) => ({ ...p, customerName: e.target.value }))}
                        style={{ ...editInputStyle, width: "140px", display: "block" }} />
                    </div>
                    <div>
                      <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Reason</span>
                      <input value={editData.reason} onChange={(e) => setEditData((p) => ({ ...p, reason: e.target.value }))}
                        style={{ ...editInputStyle, width: "160px", display: "block" }} />
                    </div>
                  </div>
                  {editData.items.map((item, idx) => (
                    <div key={idx} style={{
                      display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px",
                      padding: "4px 8px", borderRadius: "6px", background: "rgba(241,245,249,0.6)",
                    }}>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, minWidth: "100px" }}>
                        {item.qty}&times; {item.product}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>₱</span>
                        <input type="number" value={item.value || ""} onChange={(e) => {
                          setEditData((prev) => {
                            const items = [...prev.items];
                            items[idx] = { ...items[idx], value: e.target.value };
                            return { ...prev, items };
                          });
                        }} style={{ ...editInputStyle, width: "70px", fontFamily: "var(--font-mono)" }} />
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                        <input type="checkbox" checked={item.defective || false} onChange={(e) => {
                          setEditData((prev) => {
                            const items = [...prev.items];
                            items[idx] = { ...items[idx], defective: e.target.checked };
                            return { ...prev, items };
                          });
                        }} style={{ width: "13px", height: "13px", cursor: "pointer", accentColor: "#ef4444" }} />
                        <span style={{ fontSize: "10px", color: item.defective ? "#f87171" : "var(--text-dim)", fontWeight: 600 }}>Defective</span>
                      </label>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#f87171" }}>
                      Total: {fmt(editTotal)}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={cancelEdit} style={{
                        padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                        background: "transparent", cursor: "pointer", fontSize: "11px",
                        color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                      }}>Cancel</button>
                      <button onClick={saveEdit} style={{
                        padding: "4px 12px", borderRadius: "6px", border: "none",
                        background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                        color: "#fff", fontWeight: 600, fontFamily: "inherit",
                      }}>Save</button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={r.id} style={{
                padding: "8px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {r.invoice && <span style={{ fontWeight: 600 }}>{r.invoice} &middot; </span>}
                      <span>{r.customerName || "No customer"}</span>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "1px" }}>
                      {(r.items || []).map((item, i) => (
                        <span key={i}>
                          {i > 0 ? ", " : ""}{item.qty}&times; {item.product}
                          {item.defective && <span style={{ color: "#f87171", fontWeight: 600 }}> (defective)</span>}
                        </span>
                      ))}
                      {r.reason && <span> &middot; {r.reason}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#f87171" }}>
                      -{fmt(r.totalRefund || 0)}
                    </span>
                    <button onClick={() => startEdit("refund", r)} style={{
                      background: "none", border: "none", cursor: "pointer", padding: "2px",
                      color: "var(--text-dim)", display: "flex", alignItems: "center",
                    }} title="Edit">
                      <EditIcon />
                    </button>
                    <button onClick={() => setPendingDelete({ type: "refund", id: r.id })} style={{
                      background: "none", border: "none", cursor: "pointer", padding: "2px",
                      color: "var(--text-dim)", display: "flex", alignItems: "center",
                    }} title="Delete">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div style={{ padding: "12px 14px", textAlign: "center", fontSize: "11px", color: "var(--text-dim)" }}>
              No refunds recorded today.
            </div>
          )}
          {(refunds || []).length > 0 && (
            <div style={{
              padding: "8px 14px", borderTop: "1px solid var(--border)",
              background: "rgba(241,245,249,0.5)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>Total</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#f87171", fontSize: "12px" }}>
                -{fmt(refundTotal)}
              </span>
            </div>
          )}
        </div>
      </div>

      </div>{/* end side panel */}
      </div>{/* end flex row */}

      </div>
      )}

      {/* ===== REFUNDS SUB-TAB ===== */}
      {subTab === "refunds" && (
        <RefundsPage
          allRefunds={allRefunds}
          onUpdateRefund={onUpdateRefund}
          onDeleteRefund={onDeleteRefund}
        />
      )}

      </div>{/* end tab content container */}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete ${pendingDelete.type}`}
          message={`Are you sure you want to delete this ${pendingDelete.type}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            if (pendingDelete.type === "sale") onDeleteSale(pendingDelete.id);
            else if (pendingDelete.type === "swap") onDeleteSwap(pendingDelete.id);
            else if (pendingDelete.type === "refund") onDeleteRefund(pendingDelete.id);
            else if (pendingDelete.type === "expense") onDeleteExpense(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
