import React, { useState } from "react";
import { fmt, today } from "../lib/utils";
import { PlusIcon, SwapIcon, HistoryIcon, EditIcon, TrashIcon } from "../components/Icons";

export default function TransactionsPage({
  inventoryDate, setInventoryDate,
  saleTransactions, swaps, refunds,
  onOpenSaleModal, onOpenSwapModal, onOpenRefundModal,
  onUpdateSale, onUpdateSwap, onUpdateRefund,
  onDeleteSale, onDeleteSwap, onDeleteRefund,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

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

  return (
    <div className="animate-fade">
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
        <button
          onClick={() => onOpenSaleModal()}
          style={{
            marginLeft: "auto",
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
                  <button onClick={() => { if (confirm("Delete this sale?")) onDeleteSale(t.id); }} style={{
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
                    <button onClick={() => { if (confirm("Delete this swap?")) onDeleteSwap(s.id); }} style={{
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
                    <button onClick={() => { if (confirm("Delete this refund?")) onDeleteRefund(r.id); }} style={{
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
  );
}
