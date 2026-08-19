import React from "react";
import styles from "./InventoryTable.module.css";
import type { InventoryState, InventoryCell } from "../lib/types";
import type { SectionColumn, InventorySection } from "../lib/constants";

interface InventoryTableProps {
  section: InventorySection;
  data: Record<string, InventoryCell>;
  allInventory: InventoryState;
  onChange: (sectionKey: string, product: string, field: string, value: number | string) => void;
  onSaveSection: (sectionKey: string) => void;
  showAudit?: boolean;
  /** Per-product END that overrides calcEnd(). Range mode needs this: its
   *  consolidated row sums activity across days, and calcEnd would re-derive
   *  END from day one's BEG — which only holds if END(day N) === BEG(day N+1).
   *  An audit breaks that chain by design, so range mode passes the final
   *  day's actual END here rather than letting the arithmetic drift. */
  endOverride?: Record<string, number>;
}

export default function InventoryTable({ section, data, allInventory, onChange, onSaveSection, showAudit = true, endOverride }: InventoryTableProps) {
  const { columns, products, calcEnd, subgroups } = section;

  const visibleColumns = showAudit
    ? columns
    : columns.filter((col) => !col.auditSource && !col.auditReason && col.field !== "var");

  const getMergedRow = (product: string): InventoryCell => {
    const row: Record<string, unknown> = { ...(data[product] || {}) };
    for (const col of columns) {
      if (col.source) {
        const srcData = allInventory[col.source.section] || {};
        const srcRow = srcData[product] || {};
        row[col.field] = (srcRow as Record<string, unknown>)[col.source.field] || 0;
      }
      if (col.salesSource) {
        row[col.field] = data[product]?.[col.field as keyof InventoryCell] || 0;
      }
      if (col.purchaseSource) {
        row[col.field] = data[product]?.[col.field as keyof InventoryCell] || 0;
      }
      if (col.swapSource) {
        row[col.field] = data[product]?.[col.field as keyof InventoryCell] || 0;
      }
      if (col.refundSource) {
        row[col.field] = data[product]?.[col.field as keyof InventoryCell] || 0;
      }
    }
    return row as InventoryCell;
  };

  const getEndValue = (product: string) =>
    endOverride?.[product] ?? calcEnd(getMergedRow(product));
  const getVarValue = (product: string): number | null => {
    const row = getMergedRow(product);
    if (row.aud == null || (row.aud as unknown) === "") return null;
    return (parseFloat(String(row.aud)) || 0) - getEndValue(product);
  };

  const handleCellChange = (product: string, field: string, value: string) => {
    const numVal = value === "" ? "" : parseFloat(value) || 0;
    onChange(section.key, product, field, numVal);
  };

  // varVal color is runtime-dynamic (positive=green, negative=red, zero=default)
  const getVarColor = (varVal: number | null | undefined): string => {
    if (varVal == null) return "var(--text-secondary)";
    if (varVal > 0) return "#4ade80";
    if (varVal < 0) return "#f87171";
    return "var(--text-secondary)";
  };

  // th color is determined by column flags at render time
  const getColThColor = (col: SectionColumn): string => {
    if (col.calc) return "var(--accent-orange)";
    if (col.auditSource || col.auditReason) return "#22c55e";
    if (col.source || col.salesSource || col.purchaseSource || col.swapSource || col.refundSource) return "var(--accent-blue)";
    return "var(--text-muted)";
  };

  const renderProducts = (productList: string[]) =>
    productList.map((product) => {
      const mergedRow = getMergedRow(product);
      const endVal = getEndValue(product);
      const varVal = getVarValue(product);

      return (
        <tr key={product} className={styles.dataRow}>
          <td className={styles.stickyTd}>{product}</td>
          {visibleColumns.map((col) => {
            if (col.field === "end") {
              return (
                <td key={col.field} className={styles.calcCell} style={{ color: "var(--text-secondary)" }}>
                  {endVal}
                </td>
              );
            }
            if (col.field === "var") {
              return (
                <td key={col.field} className={styles.calcCell} style={{ color: getVarColor(varVal) }}>
                  {varVal != null ? varVal : "—"}
                </td>
              );
            }
            if (col.source) {
              const val = mergedRow[col.field as keyof InventoryCell] as number || 0;
              return (
                <td key={col.field} className={styles.sourcedCell} title={`Auto from ${col.source.section.toUpperCase()}.${col.source.field}`}>
                  {val || "—"}
                </td>
              );
            }
            if (col.salesSource) {
              const salesVal = mergedRow[col.field as keyof InventoryCell] as number || 0;
              return (
                <td key={col.field} className={styles.sourcedCell} title="From Sales">
                  {salesVal || "—"}
                </td>
              );
            }
            if (col.purchaseSource) {
              const purchaseVal = mergedRow[col.field as keyof InventoryCell] as number || 0;
              return (
                <td key={col.field} className={styles.sourcedCell} title="From Purchases">
                  {purchaseVal || "—"}
                </td>
              );
            }
            if (col.swapSource) {
              const swapVal = mergedRow[col.field as keyof InventoryCell] as number || 0;
              return (
                <td key={col.field} className={styles.sourcedCell} title="From Swaps">
                  {swapVal || "—"}
                </td>
              );
            }
            if (col.refundSource) {
              const refundVal = mergedRow[col.field as keyof InventoryCell] as number || 0;
              return (
                <td key={col.field} className={styles.sourcedCell} title="From Refunds">
                  {refundVal || "—"}
                </td>
              );
            }
            if (col.auditSource) {
              const audVal = mergedRow[col.field as keyof InventoryCell];
              return (
                <td key={col.field} className={styles.inputCell}>
                  <input
                    type="number"
                    value={audVal != null && audVal !== "" ? String(audVal) : ""}
                    placeholder="—"
                    onChange={(e) => handleCellChange(product, col.field, e.target.value)}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(34,197,94,0.4)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "transparent"; onSaveSection(section.key); }}
                    className={styles.auditInput}
                  />
                </td>
              );
            }
            if (col.auditReason) {
              const reasonVal = mergedRow[col.field as keyof InventoryCell];
              return (
                <td key={col.field} className={styles.inputCell}>
                  <input
                    type="text"
                    value={reasonVal != null ? String(reasonVal) : ""}
                    placeholder="—"
                    onChange={(e) => onChange(section.key, product, col.field, e.target.value)}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(34,197,94,0.4)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "transparent"; onSaveSection(section.key); }}
                    className={styles.reasonInput}
                  />
                </td>
              );
            }
            if (col.field === "beg") {
              const begVal = mergedRow[col.field as keyof InventoryCell];
              // Show the actual number, including a real 0; "—" only when there's
              // genuinely no beginning entry (null / "" / undefined).
              return (
                <td key={col.field} className={styles.sourcedCell} title="Beginning inventory">
                  {begVal != null && begVal !== "" ? String(begVal) : "—"}
                </td>
              );
            }
            const val = mergedRow[col.field as keyof InventoryCell];
            return (
              <td key={col.field} className={styles.inputCell}>
                <input
                  type="number"
                  value={val != null && val !== "" ? String(val) : ""}
                  placeholder="—"
                  onChange={(e) => handleCellChange(product, col.field, e.target.value)}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(37,99,235,0.3)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "transparent"; onSaveSection(section.key); }}
                  className={styles.cellInput}
                />
              </td>
            );
          })}
        </tr>
      );
    });

  return (
    <div className={styles.wrapper}>
      <table
        className={styles.table}
        style={{ minWidth: `${120 + visibleColumns.length * 80}px` }}
      >
        <thead>
          <tr className={styles.headerRow}>
            <th className={styles.stickyTh}>Product</th>
            {visibleColumns.map((col) => (
              <th
                key={col.field}
                className={styles.colTh}
                style={{
                  color: getColThColor(col),
                  minWidth: col.auditReason ? "140px" : "70px",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subgroups && subgroups.length > 0 ? (
            subgroups.map((sg) => (
              <React.Fragment key={sg.label}>
                <tr className={styles.subgroupRow}>
                  <td colSpan={visibleColumns.length + 1}>{sg.label}</td>
                </tr>
                {renderProducts(sg.products)}
              </React.Fragment>
            ))
          ) : (
            renderProducts(products)
          )}
        </tbody>
      </table>
    </div>
  );
}
