import { useState } from "react";
import InventorySubTab from "./InventorySubTab";
import AuditPage from "./AuditPage";
import type { InventoryState, InventoryCell, Staff, Branch } from "../../lib/types";
import type { InventorySection, PurchaseSection } from "../../lib/constants";
import type { RecordTransferInput } from "../../lib/hooks/usePurchasesData";
import styles from "./InventoryTabPage.module.css";

interface TotalCylinderRow {
  product: string;
  beg: number;
  end: number;
}

interface InventoryTabPageProps {
  branch: string;
  branches: Branch[];
  purchaseSections: PurchaseSection[];
  onRecordTransfer: (input: RecordTransferInput) => Promise<string | null>;
  inventoryDate: string;
  setInventoryDate: (v: string) => void;
  resolvedInventory: InventoryState;
  totalCylinderData: TotalCylinderRow[];
  inventorySections: InventorySection[];
  onInventoryChange: (sectionKey: string, product: string, field: keyof InventoryCell, value: number | string) => void;
  onSaveSection: (sectionKey: string) => void;
  onFixBeginning: () => void;
  inventory: unknown;
  staff: Staff[];
}

const subTabs = [
  { key: "inventory", label: "Inventory" },
  { key: "audit", label: "Audited Records" },
];

export default function InventoryTabPage({
  branch, branches, purchaseSections, onRecordTransfer,
  inventoryDate, setInventoryDate,
  resolvedInventory, totalCylinderData, inventorySections,
  onInventoryChange, onSaveSection, onFixBeginning,
  inventory, staff,
}: InventoryTabPageProps) {
  const [subTab, setSubTab] = useState("inventory");

  return (
    <div className="animate-fade">
      {/* Sub-tabs */}
      <div className={styles.subTabs}>
        {subTabs.map((tab) => {
          const isActive = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`${styles.subTab} ${isActive ? styles.subTabActive : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className={styles.card}>
        {subTab === "inventory" && (
          <InventorySubTab
            branch={branch}
            branches={branches}
            purchaseSections={purchaseSections}
            onRecordTransfer={onRecordTransfer}
            inventoryDate={inventoryDate}
            setInventoryDate={setInventoryDate}
            resolvedInventory={resolvedInventory}
            totalCylinderData={totalCylinderData}
            inventorySections={inventorySections}
            onInventoryChange={onInventoryChange}
            onSaveSection={onSaveSection}
            onFixBeginning={onFixBeginning}
            inventory={inventory}
          />
        )}

        {subTab === "audit" && (
          <AuditPage
            branch={branch}
            inventorySections={inventorySections}
            staff={staff}
          />
        )}
      </div>
    </div>
  );
}
