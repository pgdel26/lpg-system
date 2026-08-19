import InventoryTable from "../../components/InventoryTable";
import type { InventoryState } from "../../lib/types";
import type { InventorySection } from "../../lib/constants";
import styles from "./RangeView.module.css";

interface RangeTotalCylinderRow {
  product: string;
  beg: number;
  end: number;
}

interface RangeViewProps {
  inventoryDate: string;
  rangeEndDate: string;
  rangeInventory: InventoryState;
  rangeEndByProduct: Record<string, Record<string, number>>;
  inventorySections: InventorySection[];
  rangeTotalCylinderData: RangeTotalCylinderRow[];
}

export default function RangeView({
  inventoryDate,
  rangeEndDate,
  rangeInventory,
  rangeEndByProduct,
  inventorySections,
  rangeTotalCylinderData,
}: RangeViewProps) {
  return (
    <div className="animate-fade">
      <div className={styles.banner}>
        Consolidated from <strong>{inventoryDate}</strong> to <strong>{rangeEndDate}</strong>.
        BEG is from the first day; activity columns are totals for the period; END is the final day&apos;s closing balance.
        If a day in this range was audited, that correction carries into the following day&apos;s BEG — so BEG plus activity
        will not always equal END.
      </div>

      {inventorySections.map((section) => (
        <div key={section.key} className={styles.sectionBlock}>
          <div className={styles.sectionHeader}>
            {/* background is data-driven (section.color) — kept inline */}
            <div className={styles.sectionDot} style={{ background: section.color }} />
            <h3 className={styles.sectionLabel}>
              {section.label}
            </h3>
          </div>
          <InventoryTable
            section={section}
            data={rangeInventory[section.key] || {}}
            allInventory={rangeInventory}
            onChange={() => {}}
            onSaveSection={() => {}}
            endOverride={rangeEndByProduct[section.key]}
          />
        </div>
      ))}

      {/* Total Cylinder summary */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeader}>
          <div className={styles.summaryDot} />
          <h3 className={styles.sectionLabel}>
            TOTAL CYLINDER (Full + Empty)
          </h3>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.headerRow}>
                <th className={styles.thProduct}>Product</th>
                <th className={styles.thBeg}>BEG</th>
                <th className={styles.thEnd}>END</th>
              </tr>
            </thead>
            <tbody>
              {rangeTotalCylinderData.map((row) => (
                <tr key={row.product} className={styles.dataRow}>
                  <td className={styles.tdProduct}>
                    {row.product}
                  </td>
                  <td className={styles.tdBeg}>
                    {row.beg}
                  </td>
                  <td className={styles.tdEnd}>
                    {row.end}
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
