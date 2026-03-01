import React from "react";
import { today } from "../lib/utils";
import { INVENTORY_SECTIONS } from "../lib/constants";

export default function AuditPage({
  inventoryDate, setInventoryDate,
  inventory,
  onInventoryChange, onSaveSection,
}) {
  const inputStyle = {
    width: "100%", padding: "6px 8px", textAlign: "center", fontSize: "13px",
    fontFamily: "var(--font-mono)", background: "transparent",
    border: "1px solid transparent", borderRadius: "6px",
    color: "var(--text-secondary)", outline: "none",
    transition: "border-color 0.15s",
  };

  const handleAudChange = (sectionKey, product, value) => {
    const numVal = value === "" ? "" : parseFloat(value) || 0;
    onInventoryChange(sectionKey, product, "aud", numVal);
  };

  const auditSections = INVENTORY_SECTIONS;

  // Count how many products have audit values entered
  const auditedCount = auditSections.reduce((total, section) => {
    return total + section.products.filter((p) => {
      const val = inventory[section.key]?.[p]?.aud;
      return val != null && val !== "";
    }).length;
  }, 0);
  const totalProducts = auditSections.reduce((t, s) => t + s.products.length, 0);

  return (
    <div className="animate-fade">
      {/* Date selector */}
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
      </div>

      {/* Progress summary */}
      <div style={{
        display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap",
      }}>
        <div style={{
          flex: "1 1 140px", padding: "14px 16px", borderRadius: "12px",
          background: "var(--bg-card)", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Audited
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#22c55e" }}>
            {auditedCount} / {totalProducts}
          </div>
        </div>
        <div style={{
          flex: "1 1 140px", padding: "14px 16px", borderRadius: "12px",
          background: "var(--bg-card)", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Remaining
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: totalProducts - auditedCount > 0 ? "var(--accent-orange)" : "#22c55e" }}>
            {totalProducts - auditedCount}
          </div>
        </div>
      </div>

      {/* Audit sections */}
      {auditSections.map((section) => {
        const renderRows = (productList) =>
          productList.map((product) => {
            const audVal = inventory[section.key]?.[product]?.aud;

            return (
              <tr key={product} style={{ borderBottom: "1px solid rgba(15,23,42,0.04)" }}>
                <td style={{
                  padding: "8px 12px", fontSize: "12px", fontWeight: 600,
                  color: "var(--text-secondary)", whiteSpace: "nowrap",
                  position: "sticky", left: 0, background: "var(--bg-secondary)", zIndex: 2,
                }}>
                  {product}
                </td>
                <td style={{ padding: "2px 4px", minWidth: "80px" }}>
                  <input
                    type="number"
                    value={audVal != null && audVal !== "" ? audVal : ""}
                    placeholder="—"
                    onChange={(e) => handleAudChange(section.key, product, e.target.value)}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(34,197,94,0.4)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "transparent"; onSaveSection(section.key); }}
                    style={inputStyle}
                  />
                </td>
              </tr>
            );
          });

        return (
          <div key={section.key} style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: section.color }} />
              <h3 style={{
                fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)",
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                {section.label}
              </h3>
            </div>

            <div style={{
              overflowX: "auto", borderRadius: "12px",
              border: "1px solid var(--border)", background: "var(--bg-card)",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "400px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{
                      padding: "8px 12px", textAlign: "left", fontSize: "11px",
                      fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase",
                      letterSpacing: "1px", position: "sticky", left: 0,
                      background: "var(--bg-secondary)", zIndex: 3, minWidth: "120px",
                    }}>
                      Product
                    </th>
                    <th style={{
                      padding: "8px 4px", textAlign: "center", fontSize: "10px",
                      fontWeight: 600, color: "#22c55e", textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}>
                      Actual Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.subgroups ? (
                    section.subgroups.map((sg, idx) => {
                      const nextIdx = idx + 1 < section.subgroups.length ? section.subgroups[idx + 1].startIndex : section.products.length;
                      const groupProducts = section.products.slice(sg.startIndex, nextIdx);
                      return (
                        <React.Fragment key={sg.label}>
                          <tr>
                            <td
                              colSpan={2}
                              style={{
                                padding: "6px 12px", fontSize: "10px", fontWeight: 700,
                                color: "var(--text-dim)", textTransform: "uppercase",
                                letterSpacing: "1px", background: "rgba(241,245,249,0.5)",
                              }}
                            >
                              {sg.label}
                            </td>
                          </tr>
                          {renderRows(groupProducts)}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    renderRows(section.products)
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
