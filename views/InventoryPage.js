import React from "react";
import { fmt, today } from "../lib/utils";
import { INVENTORY_SECTIONS, FULL_CYLINDER_PRODUCTS } from "../lib/constants";
import { CopyIcon } from "../components/Icons";
import InventoryTable from "../components/InventoryTable";

export default function InventoryPage({
  inventoryDate, setInventoryDate,
  resolvedInventory, totalCylinderData,
  onInventoryChange, onSaveSection, onInitFromPreviousDay,
}) {
  return (
    <div className="animate-fade">
      {/* Date selector + actions */}
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
        <button
          onClick={onInitFromPreviousDay}
          style={{
            padding: "8px 14px", borderRadius: "8px", border: "none",
            cursor: "pointer", background: "rgba(241,245,249,0.8)",
            color: "var(--text-muted)", fontSize: "12px", fontWeight: 600,
            fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px",
            transition: "all 0.15s",
          }}
        >
          <CopyIcon /> Load BEG from Previous Day
        </button>
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

      {/* Inventory sections */}
      {INVENTORY_SECTIONS.map((section) => (
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
                <th style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>VAR</th>
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
