import React from "react";
import InventoryTable from "../components/InventoryTable";

export default function InventoryPage({
  inventoryDate,
  resolvedInventory, totalCylinderData,
  inventorySections,
  onInventoryChange, onSaveSection,
}) {
  return (
    <div className="animate-fade">
      {/* Inventory sections */}
      {inventorySections.map((section) => (
        <div key={section.key} style={{ marginBottom: "28px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px",
          }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: section.color,
            }} />
            <h3 style={{
              fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)",
              textTransform: "uppercase", letterSpacing: "0.5px",
            }}>
              {section.label}
            </h3>
          </div>
          <InventoryTable
            section={section}
            data={resolvedInventory[section.key] || {}}
            allInventory={resolvedInventory}
            onChange={onInventoryChange}
            onSaveSection={onSaveSection}
          />
        </div>
      ))}

      {/* Total Cylinder summary */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#94a3b8" }} />
          <h3 style={{
            fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            TOTAL CYLINDER (Full + Empty)
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
                  letterSpacing: "1px", minWidth: "120px",
                }}>Product</th>
                <th style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>BEG</th>
                <th style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>END</th>
                <th style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>DIFF</th>
              </tr>
            </thead>
            <tbody>
              {totalCylinderData.map((row) => (
                <tr key={row.product} style={{ borderBottom: "1px solid rgba(15,23,42,0.04)" }}>
                  <td style={{ padding: "6px 12px", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    {row.product}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                    {row.beg}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {row.end}
                  </td>
                  <td style={{
                    padding: "4px 6px", textAlign: "center", fontSize: "12px",
                    fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: row.var == null ? "var(--text-dim)" : row.var > 0 ? "#4ade80" : row.var < 0 ? "#f87171" : "var(--text-secondary)",
                  }}>
                    {row.var != null ? row.var : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
