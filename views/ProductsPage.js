import React, { useState } from "react";
import { fmt, today } from "../lib/utils";
import { PlusIcon, XIcon, EditIcon, TrashIcon } from "../components/Icons";

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

function CylinderPriceTable({ products: cylinderProducts, prices, editable, onChange }) {
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
      {cylinderProducts.map((product) => {
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
  onAddProduct, onUpdateProduct, onDeleteProduct,
}) {
  const [subTab, setSubTab] = useState("pricing");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEffectiveDate, setNewEffectiveDate] = useState(today());
  const [newPrices, setNewPrices] = useState({});
  const [editingDraft, setEditingDraft] = useState(false);
  const [viewingPb, setViewingPb] = useState(null);
  const [visibleCount, setVisibleCount] = useState(5);

  // Products sub-tab state
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("full");
  const [newCustomCategory, setNewCustomCategory] = useState("");
  const [editingProductKey, setEditingProductKey] = useState(null);
  const [editProductName, setEditProductName] = useState("");
  const [editProductCategory, setEditProductCategory] = useState("");
  const [editCustomCategory, setEditCustomCategory] = useState("");

  // Draft pricebook editing state
  const [draftSyncId, setDraftSyncId] = useState(null);
  const [draftPrices, setDraftPrices] = useState({});
  const [draftName, setDraftName] = useState("");
  const [draftDate, setDraftDate] = useState("");

  const draftPricebook = pricebooks.find((pb) => pb.status === "draft");
  const otherPricebooks = pricebooks.filter((pb) => pb.id !== activePricebook?.id);

  // Sync draft local state when a new draft appears (only if modal not open)
  if (draftPricebook && draftPricebook.id !== draftSyncId && !editingDraft) {
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
    try {
      const id = await onCreatePricebook(newName.trim(), newEffectiveDate, newPrices);
      if (id) {
        await onActivatePricebook(id);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDraftPriceChange = (productKey, field, value) => {
    setDraftPrices((prev) => ({
      ...prev,
      [productKey]: { ...(prev[productKey] || {}), [field]: parseFloat(value) || 0 },
    }));
  };

  const openDraftModal = () => {
    if (!draftPricebook) return;
    setDraftSyncId(draftPricebook.id);
    setDraftPrices(JSON.parse(JSON.stringify(draftPricebook.prices || {})));
    setDraftName(draftPricebook.name || "");
    setDraftDate(draftPricebook.effectiveDate || "");
    setEditingDraft(true);
  };

  const handleDraftSave = async () => {
    if (!draftPricebook) return;
    await onUpdatePricebook(draftPricebook.id, {
      name: draftName.trim(),
      effectiveDate: draftDate,
      prices: draftPrices,
    });
    setEditingDraft(false);
  };

  const handleActivate = async () => {
    if (!draftPricebook) return;
    await onUpdatePricebook(draftPricebook.id, {
      name: draftName.trim(),
      effectiveDate: draftDate,
      prices: draftPrices,
    });
    await onActivatePricebook(draftPricebook.id);
    setEditingDraft(false);
  };

  // Dynamic product name lists from Firestore products (for pricebook tables)
  const hiddenCategories = ["borrowed"];
  const dynamicFullProducts = Object.entries(products)
    .filter(([, p]) => p.category === "full")
    .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0))
    .map(([, p]) => p.name);
  const dynamicAccessoryProducts = Object.entries(products)
    .filter(([, p]) => p.category === "accessories")
    .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0))
    .map(([, p]) => p.name);

  // Grouped products for the Products sub-tab (exclude "borrowed" — not a valid category)
  const productsByCategory = Object.entries(products).reduce((acc, [key, prod]) => {
    const cat = prod.category || "unknown";
    if (hiddenCategories.includes(cat)) return acc;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push({ key, ...prod });
    return acc;
  }, {});

  const defaultCategories = { full: "Full Cylinder", empty: "Empty Cylinder", accessories: "Accessories" };
  // Build dynamic category list from existing products + defaults
  const allCategories = Object.keys({ ...defaultCategories, ...productsByCategory });
  const categoryLabels = { ...defaultCategories };
  allCategories.forEach((cat) => {
    if (!categoryLabels[cat]) categoryLabels[cat] = cat.charAt(0).toUpperCase() + cat.slice(1);
  });
  const categoryColorDefaults = { full: "#f59e42", empty: "#3b82f6", accessories: "#22c55e" };
  const extraColors = ["#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16"];
  const categoryColors = { ...categoryColorDefaults };
  let colorIdx = 0;
  allCategories.forEach((cat) => {
    if (!categoryColors[cat]) {
      categoryColors[cat] = extraColors[colorIdx % extraColors.length];
      colorIdx++;
    }
  });

  const handleAddProductSubmit = async () => {
    if (!newProductName.trim()) return;
    const category = newProductCategory === "__new__"
      ? newCustomCategory.trim().toLowerCase().replace(/\s+/g, "_")
      : newProductCategory;
    if (!category) return;
    await onAddProduct(category, newProductName.trim().toUpperCase());
    setNewProductName("");
    setNewCustomCategory("");
    setNewProductCategory("full");
    setAddingProduct(false);
  };

  const startEditProduct = (prod) => {
    setEditingProductKey(prod.key);
    setEditProductName(prod.name);
    setEditProductCategory(prod.category);
  };

  const handleEditProductSave = async () => {
    if (!editProductName.trim() || !editingProductKey) return;
    const category = editProductCategory === "__new__"
      ? editCustomCategory.trim().toLowerCase().replace(/\s+/g, "_")
      : editProductCategory;
    if (!category) return;
    await onUpdateProduct(editingProductKey, {
      name: editProductName.trim().toUpperCase(),
      category,
    });
    setEditingProductKey(null);
    setEditCustomCategory("");
  };

  return (
    <div className="animate-fade">

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid var(--border)", marginBottom: "20px" }}>
        {[{ key: "pricing", label: "Pricing" }, { key: "products", label: "Products" }].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            style={{
              padding: "10px 20px", border: "none", cursor: "pointer",
              fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
              background: "transparent",
              color: subTab === tab.key ? "var(--accent-blue)" : "var(--text-muted)",
              borderBottom: subTab === tab.key ? "2px solid var(--accent-blue)" : "2px solid transparent",
              marginBottom: "-2px",
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== PRODUCTS SUB-TAB ===== */}
      {subTab === "products" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
              Products
            </h3>
            <button
              onClick={() => setAddingProduct(true)}
              style={{
                padding: "8px 14px", borderRadius: "8px", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
              }}
            >
              <PlusIcon /> Add Product
            </button>
          </div>

          {/* Add Product Form */}
          {addingProduct && (
            <div style={{
              marginBottom: "16px", padding: "16px", borderRadius: "12px",
              background: "var(--bg-card)", border: "1px solid var(--accent-blue)",
            }}>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: "160px" }}>
                  <label style={{ ...labelStyle, display: "block", marginBottom: "4px" }}>Product Name</label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="e.g. 15KG PASAK"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleAddProductSubmit()}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "8px",
                      background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                      color: "var(--text-secondary)", fontSize: "13px", outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>
                <div style={{ minWidth: "140px" }}>
                  <label style={{ ...labelStyle, display: "block", marginBottom: "4px" }}>Category</label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => { setNewProductCategory(e.target.value); if (e.target.value !== "__new__") setNewCustomCategory(""); }}
                    style={{
                      padding: "8px 12px", borderRadius: "8px",
                      background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                      color: "var(--text-secondary)", fontSize: "13px", outline: "none", fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                    ))}
                    <option value="__new__">+ New Category</option>
                  </select>
                </div>
                {newProductCategory === "__new__" && (
                  <div style={{ minWidth: "140px" }}>
                    <label style={{ ...labelStyle, display: "block", marginBottom: "4px" }}>New Category Name</label>
                    <input
                      type="text"
                      value={newCustomCategory}
                      onChange={(e) => setNewCustomCategory(e.target.value)}
                      placeholder="e.g. Hose"
                      style={{
                        width: "100%", padding: "8px 12px", borderRadius: "8px",
                        background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                        color: "var(--text-secondary)", fontSize: "13px", outline: "none", fontFamily: "inherit",
                      }}
                    />
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleAddProductSubmit}
                    style={{
                      padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer",
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setAddingProduct(false); setNewProductName(""); }}
                    style={{
                      padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-light)",
                      cursor: "pointer", background: "transparent", color: "var(--text-muted)",
                      fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Product list by category */}
          {allCategories.map((cat) => {
            const items = (productsByCategory[cat] || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            if (items.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: "20px" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px",
                }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: categoryColors[cat] }} />
                  <span style={{ ...labelStyle, fontSize: "11px" }}>{categoryLabels[cat]}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    ({items.length})
                  </span>
                </div>
                <div style={{
                  background: "var(--bg-card)", borderRadius: "10px",
                  border: "1px solid var(--border)", overflow: "hidden",
                }}>
                  {items.map((prod) => (
                    <div key={prod.key} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 16px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                    }}>
                      {editingProductKey === prod.key ? (
                        <>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
                            <input
                              type="text"
                              value={editProductName}
                              onChange={(e) => setEditProductName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleEditProductSave()}
                              autoFocus
                              style={{
                                flex: 1, padding: "4px 8px", borderRadius: "6px",
                                background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                                color: "var(--text-secondary)", fontSize: "13px", outline: "none", fontFamily: "inherit",
                              }}
                            />
                            <select
                              value={editProductCategory}
                              onChange={(e) => { setEditProductCategory(e.target.value); if (e.target.value !== "__new__") setEditCustomCategory(""); }}
                              style={{
                                padding: "4px 8px", borderRadius: "6px",
                                background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                                color: "var(--text-secondary)", fontSize: "11px", outline: "none", fontFamily: "inherit",
                                cursor: "pointer",
                              }}
                            >
                              {allCategories.map((cat) => (
                                <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                              ))}
                              <option value="__new__">+ New Category</option>
                            </select>
                            {editProductCategory === "__new__" && (
                              <input
                                type="text"
                                value={editCustomCategory}
                                onChange={(e) => setEditCustomCategory(e.target.value)}
                                placeholder="New category"
                                style={{
                                  padding: "4px 8px", borderRadius: "6px", width: "100px",
                                  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                                  color: "var(--text-secondary)", fontSize: "11px", outline: "none", fontFamily: "inherit",
                                }}
                              />
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
                            <button
                              onClick={handleEditProductSave}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "#22c55e", fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                                padding: "4px 8px",
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingProductKey(null)}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "var(--text-dim)", fontSize: "11px", fontFamily: "inherit",
                                padding: "4px 8px",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                            {prod.name}
                          </span>
                          <div style={{ display: "flex", gap: "2px" }}>
                            <button
                              onClick={() => startEditProduct(prod)}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "var(--text-dim)", display: "flex", padding: "4px 6px", borderRadius: "6px",
                              }}
                              onMouseOver={(e) => e.currentTarget.style.color = "var(--accent-blue)"}
                              onMouseOut={(e) => e.currentTarget.style.color = "var(--text-dim)"}
                            >
                              <EditIcon />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete "${prod.name}"? This cannot be undone.`)) {
                                  onDeleteProduct(prod.key);
                                }
                              }}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "var(--text-dim)", display: "flex", padding: "4px 6px", borderRadius: "6px",
                              }}
                              onMouseOver={(e) => e.currentTarget.style.color = "#ef4444"}
                              onMouseOut={(e) => e.currentTarget.style.color = "var(--text-dim)"}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== PRICING SUB-TAB ===== */}
      {subTab === "pricing" && <>

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
            <CylinderPriceTable products={dynamicFullProducts} prices={activePricebook.prices} />
          </div>

          <div style={{ ...labelStyle, marginBottom: "6px" }}>Accessories</div>
          <div style={{ marginBottom: "16px" }}>
            <AccessoryPriceTable products={dynamicAccessoryProducts} prices={activePricebook.prices} />
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

          {otherPricebooks.slice(0, visibleCount).map((pb) => {
            const isDraft = pb.status === "draft";
            return (
              <div key={pb.id} style={{
                marginBottom: "8px", borderRadius: "10px",
                background: "var(--bg-card)", overflow: "hidden",
                border: isDraft ? "1.5px solid var(--accent-blue)" : "1px solid var(--border)",
              }}>
                <div
                  onClick={() => isDraft ? openDraftModal() : setViewingPb(pb)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 16px", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {isDraft ? (draftPricebook.name || "Untitled") : pb.name}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {isDraft ? draftPricebook.effectiveDate : pb.effectiveDate}
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
                </div>
              </div>
            );
          })}

          {otherPricebooks.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((c) => c + 5)}
              style={{
                width: "100%", padding: "10px", borderRadius: "8px",
                border: "1px solid var(--border-light)", cursor: "pointer",
                background: "transparent", color: "var(--text-muted)",
                fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                marginTop: "4px",
              }}
            >
              Show More ({otherPricebooks.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}

      </>}

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
              <CylinderPriceTable products={dynamicFullProducts} prices={newPrices} editable onChange={handleNewPriceChange} />
            </div>

            <div style={{ ...labelStyle, marginBottom: "6px" }}>Accessories</div>
            <div style={{ marginBottom: "14px" }}>
              <AccessoryPriceTable products={dynamicAccessoryProducts} prices={newPrices} editable onChange={handleNewPriceChange} />
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

      {/* Edit Draft Pricebook Modal */}
      {editingDraft && draftPricebook && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingDraft(false); }}
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
                Edit Draft Pricebook
              </h3>
              <button
                onClick={() => setEditingDraft(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
              >
                <XIcon />
              </button>
            </div>

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
              <CylinderPriceTable products={dynamicFullProducts} prices={draftPrices} editable onChange={handleDraftPriceChange} />
            </div>

            <div style={{ ...labelStyle, marginBottom: "6px" }}>Accessories</div>
            <div style={{ marginBottom: "14px" }}>
              <AccessoryPriceTable products={dynamicAccessoryProducts} prices={draftPrices} editable onChange={handleDraftPriceChange} />
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                onClick={() => setEditingDraft(false)}
                style={{
                  padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-light)",
                  cursor: "pointer", background: "transparent", color: "var(--text-muted)",
                  fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button onClick={handleDraftSave} style={{
                padding: "8px 20px", borderRadius: "8px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
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
        </div>
      )}

      {/* View Deactivated Pricebook Modal */}
      {viewingPb && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewingPb(null); }}
        >
          <div style={{
            background: "var(--bg-secondary)", borderRadius: "16px",
            border: "1px solid var(--border)", padding: "24px",
            width: "100%", maxWidth: "520px",
            boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {viewingPb.name}
                </h3>
                <span style={{
                  fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px",
                  textTransform: "uppercase", letterSpacing: "0.5px",
                  color: "var(--text-dim)", background: "rgba(100,116,139,0.1)",
                }}>
                  Deactivated
                </span>
              </div>
              <button
                onClick={() => setViewingPb(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
              >
                <XIcon />
              </button>
            </div>

            <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "16px" }}>
              Effective from {viewingPb.effectiveDate}
            </p>

            <div style={{ ...labelStyle, marginBottom: "6px" }}>Cylinders</div>
            <div style={{ marginBottom: "14px" }}>
              <CylinderPriceTable products={dynamicFullProducts} prices={viewingPb.prices} />
            </div>

            <div style={{ ...labelStyle, marginBottom: "6px" }}>Accessories</div>
            <div style={{ marginBottom: "14px" }}>
              <AccessoryPriceTable products={dynamicAccessoryProducts} prices={viewingPb.prices} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setViewingPb(null)}
                style={{
                  padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-light)",
                  cursor: "pointer", background: "transparent", color: "var(--text-muted)",
                  fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
