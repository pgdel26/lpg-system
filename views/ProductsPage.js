import React, { useState } from "react";
import { fmt, today } from "../lib/utils";
import { FULL_CYLINDER_PRODUCTS, REGULATOR_PRODUCTS, OTHERS_PRODUCTS } from "../lib/constants";
import { PlusIcon, XIcon } from "../components/Icons";

const inputStyle = {
  width: "90px", padding: "4px 8px", borderRadius: "6px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-mono)",
  outline: "none", textAlign: "right",
};

const labelStyle = {
  fontSize: "10px", fontWeight: 700, color: "var(--text-dim)",
  textTransform: "uppercase", letterSpacing: "1px",
};

function CylinderPriceTable({ prices, editable, onChange }) {
  return (
    <div style={{
      background: "var(--bg-card)", borderRadius: "10px",
      border: "1px solid var(--border)", overflow: "hidden",
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 1fr 1fr",
        padding: "6px 16px", borderBottom: "1px solid var(--border)",
        ...labelStyle,
      }}>
        <span>Product</span>
        <span style={{ textAlign: "right" }}>Cylinder</span>
        <span style={{ textAlign: "right" }}>Refill</span>
      </div>
      {FULL_CYLINDER_PRODUCTS.map((product) => {
        const key = `full_${product}`;
        const cylinder = prices?.[key]?.cylinder || 0;
        const refill = prices?.[key]?.refill || 0;
        return (
          <div key={product} style={{
            display: "grid", gridTemplateColumns: "2fr 1fr 1fr",
            padding: "6px 16px", alignItems: "center",
            borderBottom: "1px solid rgba(15,23,42,0.04)",
          }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>{product}</span>
            {editable ? (
              <>
                <div style={{ textAlign: "right" }}>
                  <input type="number" value={cylinder || ""} onChange={(e) => onChange(key, "cylinder", e.target.value)} style={inputStyle} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <input type="number" value={refill || ""} onChange={(e) => onChange(key, "refill", e.target.value)} style={inputStyle} />
                </div>
              </>
            ) : (
              <>
                <span style={{ textAlign: "right", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                  {fmt(cylinder)}
                </span>
                <span style={{ textAlign: "right", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                  {fmt(refill)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AccessoryPriceTable({ label, products: accessoryProducts, prices, editable, onChange }) {
  return (
    <div style={{
      background: "var(--bg-card)", borderRadius: "10px",
      border: "1px solid var(--border)", overflow: "hidden",
    }}>
      {label && (
        <div style={{
          padding: "5px 16px", fontSize: "10px", fontWeight: 700,
          color: "var(--text-dim)", textTransform: "uppercase",
          letterSpacing: "1px", background: "rgba(241,245,249,0.5)",
        }}>
          {label}
        </div>
      )}
      {accessoryProducts.map((product) => {
        const key = `accessories_${product}`;
        const srp = prices?.[key]?.srp || 0;
        return (
          <div key={product} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 16px", borderBottom: "1px solid rgba(15,23,42,0.04)",
          }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>{product}</span>
            {editable ? (
              <input type="number" value={srp || ""} onChange={(e) => onChange(key, "srp", e.target.value)} style={inputStyle} />
            ) : (
              <span style={{ fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>
                {fmt(srp)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ProductsPage({
  products, pricebooks, activePricebook,
  onCreatePricebook, onUpdatePricebook, onActivatePricebook,
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEffectiveDate, setNewEffectiveDate] = useState(today());
  const [newPrices, setNewPrices] = useState({});
  const [expandedPb, setExpandedPb] = useState(null);

  // Draft pricebook editing state
  const [draftSyncId, setDraftSyncId] = useState(null);
  const [draftPrices, setDraftPrices] = useState({});
  const [draftName, setDraftName] = useState("");
  const [draftDate, setDraftDate] = useState("");

  const draftPricebook = pricebooks.find((pb) => pb.status === "draft");
  const otherPricebooks = pricebooks.filter((pb) => pb.id !== activePricebook?.id);

  // Sync draft local state when a new draft appears
  if (draftPricebook && draftPricebook.id !== draftSyncId) {
    setDraftSyncId(draftPricebook.id);
    setDraftPrices(JSON.parse(JSON.stringify(draftPricebook.prices || {})));
    setDraftName(draftPricebook.name || "");
    setDraftDate(draftPricebook.effectiveDate || "");
  }

  const buildDefaultPrices = () => {
    const prices = {};
    for (const [key, prod] of Object.entries(products)) {
      if (prod.category === "full") {
        prices[key] = {
          cylinder: (prod.srp || 0) - (prod.srpRefill || 0),
          refill: prod.srpRefill || 0,
        };
      } else if (prod.category === "accessories") {
        prices[key] = { srp: prod.srp || 0 };
      }
    }
    return prices;
  };

  const openCreateModal = () => {
    const defaultName = new Date().toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    setNewName(defaultName);
    setNewEffectiveDate(today());
    setNewPrices(activePricebook?.prices ? JSON.parse(JSON.stringify(activePricebook.prices)) : buildDefaultPrices());
    setCreating(true);
  };

  const handleNewPriceChange = (productKey, field, value) => {
    setNewPrices((prev) => ({
      ...prev,
      [productKey]: { ...(prev[productKey] || {}), [field]: parseFloat(value) || 0 },
    }));
  };

  const handleCreateSave = async () => {
    if (!newName.trim()) return;
    await onCreatePricebook(newName.trim(), newEffectiveDate, newPrices);
    setCreating(false);
  };

  const handleCreateAndActivate = async () => {
    if (!newName.trim()) return;
    const id = await onCreatePricebook(newName.trim(), newEffectiveDate, newPrices);
    if (id) {
      await onActivatePricebook(id);
    }
    setCreating(false);
  };

  const handleDraftPriceChange = (productKey, field, value) => {
    setDraftPrices((prev) => ({
      ...prev,
      [productKey]: { ...(prev[productKey] || {}), [field]: parseFloat(value) || 0 },
    }));
  };

  const handleDraftSave = async () => {
    if (!draftPricebook) return;
    await onUpdatePricebook(draftPricebook.id, {
      name: draftName.trim(),
      effectiveDate: draftDate,
      prices: draftPrices,
    });
  };

  const handleActivate = async () => {
    if (!draftPricebook) return;
    await onUpdatePricebook(draftPricebook.id, {
      name: draftName.trim(),
      effectiveDate: draftDate,
      prices: draftPrices,
    });
    await onActivatePricebook(draftPricebook.id);
  };

  return (
    <div className="animate-fade">

      {/* Active Pricebook (read-only) */}
      {activePricebook && (
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {activePricebook.name}
                </h3>
                <span style={{
                  fontSize: "10px", fontWeight: 700, color: "#22c55e",
                  background: "rgba(34,197,94,0.1)", padding: "2px 8px", borderRadius: "10px",
                  textTransform: "uppercase", letterSpacing: "0.5px",
                }}>
                  Active
                </span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px", marginLeft: "16px" }}>
                Effective from {activePricebook.effectiveDate}
              </p>
            </div>
            {!draftPricebook && (
              <button
                onClick={openCreateModal}
                style={{
                  padding: "8px 14px", borderRadius: "8px", border: "none",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                }}
              >
                <PlusIcon /> New Pricebook
              </button>
            )}
          </div>

          <div style={{ ...labelStyle, marginBottom: "6px" }}>Cylinders</div>
          <div style={{ marginBottom: "16px" }}>
            <CylinderPriceTable prices={activePricebook.prices} />
          </div>

          <div style={{ ...labelStyle, marginBottom: "6px" }}>Accessories</div>
          <div style={{ marginBottom: "16px" }}>
            <AccessoryPriceTable label="REGULATOR" products={REGULATOR_PRODUCTS} prices={activePricebook.prices} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <AccessoryPriceTable label="OTHERS" products={OTHERS_PRODUCTS} prices={activePricebook.prices} />
          </div>
        </div>
      )}

      {/* No active pricebook */}
      {!activePricebook && (
        <div style={{
          padding: "24px", textAlign: "center", borderRadius: "12px",
          background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "28px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
            No active pricebook. {!draftPricebook ? "Create one to set your product prices." : "Activate a draft pricebook below."}
          </p>
          {!draftPricebook && (
            <button
              onClick={openCreateModal}
              style={{
                padding: "8px 16px", borderRadius: "8px", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                margin: "0 auto",
              }}
            >
              <PlusIcon /> Create Pricebook
            </button>
          )}
        </div>
      )}

      {/* All Other Pricebooks */}
      {otherPricebooks.length > 0 && (
        <div>
          <h3 style={{
            fontSize: "12px", fontWeight: 700, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px",
          }}>
            Pricebooks
          </h3>

          {otherPricebooks.map((pb) => {
            const isDraft = pb.status === "draft";
            const isExpanded = expandedPb === pb.id;
            return (
              <div key={pb.id} style={{
                marginBottom: "8px", borderRadius: "10px",
                background: "var(--bg-card)", overflow: "hidden",
                border: isDraft ? "1.5px solid var(--accent-blue)" : "1px solid var(--border)",
              }}>
                <div
                  onClick={() => setExpandedPb(isExpanded ? null : pb.id)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 16px", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {isDraft ? (draftName || pb.name || "Untitled") : pb.name}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {isDraft ? (draftDate || pb.effectiveDate) : pb.effectiveDate}
                    </span>
                    <span style={{
                      fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px",
                      textTransform: "uppercase", letterSpacing: "0.5px",
                      color: isDraft ? "var(--accent-blue)" : "var(--text-dim)",
                      background: isDraft ? "rgba(59,130,246,0.1)" : "rgba(100,116,139,0.1)",
                    }}>
                      {isDraft ? "Draft" : "Deactivated"}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {isExpanded && isDraft && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "16px" }}>
                    <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: "180px" }}>
                        <label style={{ ...labelStyle, display: "block", marginBottom: "4px" }}>Name</label>
                        <input
                          type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)}
                          placeholder="e.g. February 2026"
                          style={{
                            width: "100%", padding: "8px 12px", borderRadius: "8px",
                            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                            color: "var(--text-secondary)", fontSize: "13px", outline: "none", fontFamily: "inherit",
                          }}
                        />
                      </div>
                      <div style={{ minWidth: "160px" }}>
                        <label style={{ ...labelStyle, display: "block", marginBottom: "4px" }}>Effective Date</label>
                        <input
                          type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)}
                          style={{
                            padding: "8px 12px", borderRadius: "8px",
                            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                            color: "var(--text-secondary)", fontSize: "13px", fontFamily: "var(--font-mono)", outline: "none",
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ ...labelStyle, marginBottom: "6px" }}>Cylinders</div>
                    <div style={{ marginBottom: "14px" }}>
                      <CylinderPriceTable prices={draftPrices} editable onChange={handleDraftPriceChange} />
                    </div>
                    <div style={{ ...labelStyle, marginBottom: "6px" }}>Accessories</div>
                    <div style={{ marginBottom: "14px" }}>
                      <AccessoryPriceTable label="REGULATOR" products={REGULATOR_PRODUCTS} prices={draftPrices} editable onChange={handleDraftPriceChange} />
                    </div>
                    <div style={{ marginBottom: "14px" }}>
                      <AccessoryPriceTable label="OTHERS" products={OTHERS_PRODUCTS} prices={draftPrices} editable onChange={handleDraftPriceChange} />
                    </div>
                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
                      <button onClick={handleDraftSave} style={{
                        padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-light)",
                        cursor: "pointer", background: "transparent", color: "var(--text-muted)",
                        fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                      }}>
                        Save Draft
                      </button>
                      <button onClick={handleActivate} style={{
                        padding: "8px 20px", borderRadius: "8px", border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, #22c55e, #16a34a)",
                        color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                      }}>
                        Activate Pricebook
                      </button>
                    </div>
                  </div>
                )}

                {isExpanded && !isDraft && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
                    <div style={{ padding: "0 16px 8px" }}>
                      <CylinderPriceTable prices={pb.prices} />
                    </div>
                    <div style={{ padding: "0 16px 8px" }}>
                      <AccessoryPriceTable label="REGULATOR" products={REGULATOR_PRODUCTS} prices={pb.prices} />
                    </div>
                    <div style={{ padding: "0 16px 4px" }}>
                      <AccessoryPriceTable label="OTHERS" products={OTHERS_PRODUCTS} prices={pb.prices} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Pricebook Modal */}
      {creating && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setCreating(false); }}
        >
          <div style={{
            background: "var(--bg-secondary)", borderRadius: "16px",
            border: "1px solid var(--border)", padding: "24px",
            width: "100%", maxWidth: "520px",
            boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                New Pricebook
              </h3>
              <button
                onClick={() => setCreating(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
              >
                <XIcon />
              </button>
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <label style={{ ...labelStyle, display: "block", marginBottom: "4px" }}>Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. February 2026"
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: "8px",
                    background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                    color: "var(--text-secondary)", fontSize: "13px", outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>
              <div style={{ minWidth: "160px" }}>
                <label style={{ ...labelStyle, display: "block", marginBottom: "4px" }}>Effective Date</label>
                <input
                  type="date"
                  value={newEffectiveDate}
                  onChange={(e) => setNewEffectiveDate(e.target.value)}
                  style={{
                    padding: "8px 12px", borderRadius: "8px",
                    background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                    color: "var(--text-secondary)", fontSize: "13px", fontFamily: "var(--font-mono)", outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ ...labelStyle, marginBottom: "6px" }}>Cylinders</div>
            <div style={{ marginBottom: "14px" }}>
              <CylinderPriceTable prices={newPrices} editable onChange={handleNewPriceChange} />
            </div>

            <div style={{ ...labelStyle, marginBottom: "6px" }}>Accessories</div>
            <div style={{ marginBottom: "14px" }}>
              <AccessoryPriceTable label="REGULATOR" products={REGULATOR_PRODUCTS} prices={newPrices} editable onChange={handleNewPriceChange} />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <AccessoryPriceTable label="OTHERS" products={OTHERS_PRODUCTS} prices={newPrices} editable onChange={handleNewPriceChange} />
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                onClick={() => setCreating(false)}
                style={{
                  padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-light)",
                  cursor: "pointer", background: "transparent", color: "var(--text-muted)",
                  fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSave}
                style={{
                  padding: "8px 20px", borderRadius: "8px", border: "none",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                }}
              >
                Save as Draft
              </button>
              <button
                onClick={handleCreateAndActivate}
                style={{
                  padding: "8px 20px", borderRadius: "8px", border: "none",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                }}
              >
                Save & Activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
