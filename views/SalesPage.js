import React from "react";
import { fmt, today, getPricebookSrp } from "../lib/utils";
import { SALES_SECTIONS } from "../lib/constants";
import { PlusIcon, SwapIcon, HistoryIcon } from "../components/Icons";

export default function SalesPage({
  inventoryDate, setInventoryDate,
  saleTransactions, activePricebook,
  swaps, refunds,
  onOpenSaleModal, onOpenSwapModal, onOpenRefundModal,
}) {
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
            marginLeft: "auto", padding: "8px 16px", borderRadius: "8px", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
          }}
        >
          <PlusIcon /> Record Sale
        </button>
      </div>

      {/* Grand total card at top */}
      {(() => {
        const salesTotal = saleTransactions.reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
        const swapTotal = swaps.reduce((sum, s) => sum + (s.price || 0), 0);
        const refundTotal = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);
        const grandTotal = salesTotal + swapTotal - refundTotal;

        return (
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
        );
      })()}

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
        {/* Left: Sales entry table */}
        <div style={{ flex: 2, minWidth: 0 }}>
          {SALES_SECTIONS.map((saleSec) => {
            const getSrp = (product) => {
              const key = `${saleSec.productCategory}_${product}`;
              return getPricebookSrp(saleSec.key, key, activePricebook?.prices);
            };

            const sectionTx = saleTransactions.filter((t) => t.saleSection === saleSec.key);
            const sectionTotal = sectionTx.reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);

            const getTxCount = (product) => sectionTx.filter((t) => t.product === product).reduce((s, t) => s + (t.quantity || 1), 0);
            const getTxTotal = (product) => sectionTx.filter((t) => t.product === product).reduce((s, t) => s + (t.totalAmount || t.finalPrice || 0), 0);

            return (
              <div key={saleSec.key} style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <h3 style={{
                    fontSize: "12px", fontWeight: 700, color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.5px",
                  }}>
                    {saleSec.label}
                  </h3>
                  {sectionTotal > 0 && (
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                      {fmt(sectionTotal)}
                    </span>
                  )}
                </div>

                <div style={{
                  background: "var(--bg-card)", borderRadius: "12px",
                  border: "1px solid var(--border)", overflow: "hidden",
                }}>
                  {/* Header */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr 60px 1fr",
                    padding: "8px 16px", borderBottom: "1px solid var(--border)",
                    fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
                    textTransform: "uppercase", letterSpacing: "1px",
                  }}>
                    <span>Product</span>
                    <span style={{ textAlign: "right" }}>SRP</span>
                    <span style={{ textAlign: "center" }}>Sold</span>
                    <span style={{ textAlign: "right" }}>Total</span>
                  </div>

                  {/* Rows */}
                  {saleSec.subgroups ? (
                    saleSec.subgroups.map((sg) => (
                      <React.Fragment key={sg.label}>
                        <div style={{
                          padding: "5px 16px", fontSize: "10px", fontWeight: 700,
                          color: "var(--text-dim)", textTransform: "uppercase",
                          letterSpacing: "1px", background: "rgba(241,245,249,0.5)",
                        }}>
                          {sg.label}
                        </div>
                        {sg.products.map((product) => {
                          const qty = getTxCount(product);
                          const total = getTxTotal(product);
                          return (
                            <div key={product} style={{
                              display: "grid", gridTemplateColumns: "2fr 1fr 60px 1fr",
                              padding: "8px 16px", alignItems: "center",
                              borderBottom: "1px solid rgba(15,23,42,0.04)",
                            }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>{product}</span>
                              <span style={{ textAlign: "right", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{fmt(getSrp(product))}</span>
                              <span style={{ textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: qty > 0 ? "var(--text-secondary)" : "var(--text-dim)" }}>{qty || "—"}</span>
                              <span style={{
                                textAlign: "right", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600,
                                color: total > 0 ? "var(--accent-gold)" : "var(--text-dim)",
                              }}>
                                {total > 0 ? fmt(total) : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    saleSec.products.map((product) => {
                      const qty = getTxCount(product);
                      const total = getTxTotal(product);
                      return (
                        <div key={product} style={{
                          display: "grid", gridTemplateColumns: "2fr 1fr 60px 1fr",
                          padding: "8px 16px", alignItems: "center",
                          borderBottom: "1px solid rgba(15,23,42,0.04)",
                        }}>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>{product}</span>
                          <span style={{ textAlign: "right", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{fmt(getSrp(product))}</span>
                          <span style={{ textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: qty > 0 ? "var(--text-secondary)" : "var(--text-dim)" }}>{qty || "—"}</span>
                          <span style={{
                            textAlign: "right", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600,
                            color: total > 0 ? "var(--accent-gold)" : "var(--text-dim)",
                          }}>
                            {total > 0 ? fmt(total) : "—"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}

        </div>

        {/* Right: Borrow + Upgrade/Swap */}
        <div style={{ flex: 1, minWidth: "280px", position: "sticky", top: "80px", alignSelf: "flex-start" }}>

          {/* ---- UPGRADE / SWAP SECTION ---- */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }} />
                <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Upgrade / Swap
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {(() => {
                  const swapTotal = swaps.reduce((sum, s) => sum + (s.price || 0), 0);
                  return swapTotal > 0 ? (
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                      {fmt(swapTotal)}
                    </span>
                  ) : null;
                })()}
                <button
                  onClick={onOpenSwapModal}
                  style={{
                    padding: "5px 10px", borderRadius: "6px", border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                    background: "rgba(59,130,246,0.12)", color: "#60a5fa",
                    fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                  }}
                >
                  <SwapIcon /> Add Upgrade/Swap
                </button>
              </div>
            </div>

            <div style={{
              background: "var(--bg-card)", borderRadius: "12px",
              border: "1px solid var(--border)", overflow: "hidden",
            }}>
              {swaps.length > 0 && swaps.map((s) => (
                <div key={s.id} style={{
                  padding: "8px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      <span style={{ fontWeight: 600 }}>{s.productFrom}</span>
                      <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>&rarr;</span>
                      <span style={{ fontWeight: 600 }}>{s.productTo}</span>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                      {fmt(s.price)}
                    </span>
                  </div>
                </div>
              ))}

              {swaps.length === 0 && (
                <div style={{ padding: "12px 14px", textAlign: "center", fontSize: "11px", color: "var(--text-dim)" }}>
                  No swaps recorded today.
                </div>
              )}
            </div>
          </div>

          {/* ---- REFUND / RETURN SECTION ---- */}
          <div style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444" }} />
                <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Refund / Return
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {(() => {
                  const refundTotal = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);
                  return refundTotal > 0 ? (
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#f87171" }}>
                      -{fmt(refundTotal)}
                    </span>
                  ) : null;
                })()}
                <button
                  onClick={onOpenRefundModal}
                  style={{
                    padding: "5px 10px", borderRadius: "6px", border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                    background: "rgba(239,68,68,0.12)", color: "#f87171",
                    fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                  }}
                >
                  <HistoryIcon /> Add Refund
                </button>
              </div>
            </div>

            <div style={{
              background: "var(--bg-card)", borderRadius: "12px",
              border: "1px solid var(--border)", overflow: "hidden",
            }}>
              {(refunds || []).length > 0 ? (refunds || []).map((r) => (
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
                            {i > 0 ? ", " : ""}{item.qty}× {item.product}
                          </span>
                        ))}
                        {r.reason && <span> &middot; {r.reason}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#f87171", flexShrink: 0, marginLeft: "8px" }}>
                      -{fmt(r.totalRefund || 0)}
                    </span>
                  </div>
                </div>
              )) : (
                <div style={{ padding: "12px 14px", textAlign: "center", fontSize: "11px", color: "var(--text-dim)" }}>
                  No refunds recorded today.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
