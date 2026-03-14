import React, { useState } from "react";
import InventoryPage from "./InventoryPage";
import AuditPage from "./AuditPage";

export default function InventoryTabPage({
  inventoryDate, setInventoryDate,
  resolvedInventory, totalCylinderData, inventorySections,
  onInventoryChange, onSaveSection, onInitFromPreviousDay,
  inventory,
}) {
  const [subTab, setSubTab] = useState("inventory");

  const subTabs = [
    { key: "inventory", label: "Inventory" },
    { key: "audit", label: "Audit" },
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
        {subTab === "inventory" && (
          <InventoryPage
            inventoryDate={inventoryDate}
            setInventoryDate={setInventoryDate}
            resolvedInventory={resolvedInventory}
            totalCylinderData={totalCylinderData}
            inventorySections={inventorySections}
            onInventoryChange={onInventoryChange}
            onSaveSection={onSaveSection}
            onInitFromPreviousDay={onInitFromPreviousDay}
          />
        )}

        {subTab === "audit" && (
          <AuditPage
            inventoryDate={inventoryDate}
            setInventoryDate={setInventoryDate}
            inventory={inventory}
            inventorySections={inventorySections}
            onInventoryChange={onInventoryChange}
            onSaveSection={onSaveSection}
          />
        )}
      </div>
    </div>
  );
}
