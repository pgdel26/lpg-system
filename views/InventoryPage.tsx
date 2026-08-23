import React from "react";
import InventoryTable from "../components/InventoryTable";
import type { InventoryState } from "../lib/types";
import type { InventorySection } from "../lib/constants";
import styles from "./InventoryPage.module.css";

interface TotalCylinderRow {
  product: string;
  beg: number;
  end: number;
}

interface InventoryPageProps {
  inventoryDate: string;
  resolvedInventory: InventoryState;
  totalCylinderData: TotalCylinderRow[];
  inventorySections: InventorySection[];
  onInventoryChange: (sectionKey: string, product: string, field: string, value: number | string) => void;
  onSaveSection: (sectionKey: string) => void;
}

export default function InventoryPage({
  resolvedInventory,
  totalCylinderData,
  inventorySections,
  onInventoryChange,
  onSaveSection,
}: InventoryPageProps) {
  return (
    <div className="animate-fade">
      {/* Inventory sections */}
      {inventorySections.map((section) => (
        <div key={section.key} className={styles.sectionBlock}>
          <div className={styles.sectionHeader}>
            {/* background is data-driven (section.color) — kept inline */}
            <div className={styles.sectionDot} style={{ background: section.color }} />
            <h3 className={styles.sectionLabel}>{section.label}</h3>
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
      <div className={styles.summaryBlock}>
        <div className={styles.sectionHeader}>
          <div className={styles.summaryDot} />
          <h3 className={styles.sectionLabel}>TOTAL CYLINDER (Full + Empty)</h3>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHeadRow}>
                <th className={styles.thProduct}>Product</th>
                <th className={styles.thBeg}>BEG</th>
                <th className={styles.thEnd}>END</th>
              </tr>
            </thead>
            <tbody>
              {totalCylinderData.map((row) => (
                <tr key={row.product} className={styles.tableBodyRow}>
                  <td className={styles.tdProduct}>{row.product}</td>
                  <td className={styles.tdBeg}>{row.beg}</td>
                  <td className={styles.tdEnd}>{row.end}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
