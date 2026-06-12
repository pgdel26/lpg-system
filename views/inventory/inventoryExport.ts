import * as XLSX from "xlsx-js-style";
import type { InventoryState, InventoryCell } from "../../lib/types";
import type { InventorySection } from "../../lib/constants";

export function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (current <= last) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

interface TotalCylinderRow {
  product: string;
  beg: number;
  end: number;
}

// Per-day resolved inventory keyed by date, shaped like resolvedInventory.
type RangeDailyData = Record<string, InventoryState>;

const getMergedRow = (
  resolvedInventory: InventoryState,
  section: InventorySection,
  product: string,
): InventoryCell => {
  const sectionData = resolvedInventory[section.key] || {};
  const row: Record<string, unknown> = { ...(sectionData[product] || {}) };
  for (const col of section.columns) {
    if (col.source) {
      const srcData = resolvedInventory[col.source.section] || {};
      row[col.field] = (srcData[product] as Record<string, unknown> | undefined)?.[col.source.field] || 0;
    }
    if (col.salesSource || col.purchaseSource || col.swapSource || col.refundSource) {
      row[col.field] = (sectionData[product] as Record<string, unknown> | undefined)?.[col.field] || 0;
    }
  }
  return row as InventoryCell;
};

interface ExportSingleArgs {
  resolvedInventory: InventoryState;
  totalCylinderData: TotalCylinderRow[];
  inventorySections: InventorySection[];
  inventoryDate: string;
  rangeMode: boolean;
  rangeEndDate: string;
}

export function exportInventory({
  resolvedInventory,
  totalCylinderData,
  inventorySections,
  inventoryDate,
  rangeMode,
  rangeEndDate,
}: ExportSingleArgs): void {
  const boldSz = (sz: number) => ({ font: { bold: true, sz } });
  const sectionHeader = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
  const tableHeader = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
  const subgroupHeader = { font: { bold: true, sz: 10, color: { rgb: "64748B" } }, fill: { fgColor: { rgb: "F1F5F9" } } };
  const totalRowStyle = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };

  const sectionRows: number[] = [];
  const tableHeaderRows: number[] = [];
  const subgroupRows: number[] = [];
  const totalRows: number[] = [];

  const data: unknown[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let r: number;

  data.push(["DAILY INVENTORY REPORT"]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
  data.push([rangeMode && rangeEndDate ? `Date: ${inventoryDate} to ${rangeEndDate}` : `Date: ${inventoryDate}`]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
  data.push([]);

  for (const section of inventorySections) {
    r = data.length;
    data.push([section.label.toUpperCase()]);
    sectionRows.push(r);
    merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });

    r = data.length;
    data.push(["Product", ...section.columns.map((c) => c.label)]);
    tableHeaderRows.push(r);

    const renderProducts = (products: string[]) => {
      for (const product of products) {
        const row = getMergedRow(resolvedInventory, section, product) as Record<string, unknown>;
        const endVal = section.calcEnd ? section.calcEnd(row) : ((row.end as number) || 0);
        const varVal = (row.aud != null && row.aud !== "")
          ? (parseFloat(String(row.aud)) || 0) - endVal
          : null;

        const cells: unknown[] = [product];
        for (const col of section.columns) {
          if (col.field === "end") cells.push(endVal);
          else if (col.field === "var") cells.push(varVal != null ? varVal : "");
          else {
            const v = row[col.field];
            cells.push(v != null && v !== "" ? v : 0);
          }
        }
        data.push(cells);
      }
    };

    if (section.subgroups && section.subgroups.length > 0) {
      for (const sg of section.subgroups) {
        r = data.length;
        data.push([sg.label]);
        subgroupRows.push(r);
        merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });
        renderProducts(sg.products);
      }
    } else {
      renderProducts(section.products);
    }
    data.push([]);
  }

  r = data.length;
  data.push(["TOTAL CYLINDER (Full + Empty)"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
  r = data.length;
  data.push(["Product", "BEG", "END"]);
  tableHeaderRows.push(r);
  for (const row of totalCylinderData) {
    data.push([row.product, row.beg, row.end]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = merges;
  const colWidths = [{ wch: 20 }];
  for (let i = 0; i < 9; i++) colWidths.push({ wch: 10 });
  ws["!cols"] = colWidths;

  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = (ws as Record<string, { s?: unknown }>)[addr];
      if (!cell) continue;
      if (R === 0) cell.s = boldSz(16);
      else if (R === 1) cell.s = boldSz(12);
      else if (sectionRows.includes(R)) cell.s = sectionHeader;
      else if (tableHeaderRows.includes(R)) cell.s = tableHeader;
      else if (subgroupRows.includes(R)) cell.s = subgroupHeader;
      else if (totalRows.includes(R)) cell.s = { ...totalRowStyle };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  XLSX.writeFile(wb, rangeMode && rangeEndDate ? `Inventory_${inventoryDate}_to_${rangeEndDate}.xlsx` : `Inventory_${inventoryDate}.xlsx`);
}

interface ExportDailyArgs {
  rangeDailyData: RangeDailyData | null;
  inventorySections: InventorySection[];
  inventoryDate: string;
  rangeEndDate: string;
}

export function exportDailyReports({
  rangeDailyData,
  inventorySections,
  inventoryDate,
  rangeEndDate,
}: ExportDailyArgs): void {
  if (!rangeDailyData) return;
  const boldSz = (sz: number) => ({ font: { bold: true, sz } });
  const sectionHeader = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
  const tableHeader = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
  const subgroupHeader = { font: { bold: true, sz: 10, color: { rgb: "64748B" } }, fill: { fgColor: { rgb: "F1F5F9" } } };

  const wb = XLSX.utils.book_new();
  const dates = getDatesInRange(inventoryDate, rangeEndDate);

  for (const date of dates) {
    const dayData = rangeDailyData[date] || {};
    const sectionRows: number[] = [], tableHeaderRows: number[] = [], subgroupRows: number[] = [];
    const data: unknown[][] = [];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    let r: number;

    data.push(["DAILY INVENTORY REPORT"]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
    data.push([`Date: ${date}`]);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
    data.push([]);

    for (const section of inventorySections) {
      r = data.length;
      data.push([section.label.toUpperCase()]);
      sectionRows.push(r);
      merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });

      r = data.length;
      data.push(["Product", ...section.columns.map((c) => c.label)]);
      tableHeaderRows.push(r);

      const sectionData = dayData[section.key] || {};

      const renderProducts = (products: string[]) => {
        for (const product of products) {
          const row = (sectionData[product] || {}) as Record<string, unknown>;
          const endVal = section.calcEnd ? section.calcEnd(row) : ((row.end as number) || 0);
          const varVal = (row.aud != null && row.aud !== "")
            ? (parseFloat(String(row.aud)) || 0) - endVal : null;

          const cells: unknown[] = [product];
          for (const col of section.columns) {
            if (col.field === "end") cells.push(endVal);
            else if (col.field === "var") cells.push(varVal != null ? varVal : "");
            else {
              const v = row[col.field];
              cells.push(v != null && v !== "" ? v : 0);
            }
          }
          data.push(cells);
        }
      };

      if (section.subgroups && section.subgroups.length > 0) {
        for (const sg of section.subgroups) {
          r = data.length;
          data.push([sg.label]);
          subgroupRows.push(r);
          merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });
          renderProducts(sg.products);
        }
      } else {
        renderProducts(section.products);
      }
      data.push([]);
    }

    // Total cylinder summary
    const fullSection = inventorySections.find((s) => s.key === "full");
    const emptySection = inventorySections.find((s) => s.key === "empty");
    if (fullSection && emptySection) {
      r = data.length;
      data.push(["TOTAL CYLINDER (Full + Empty)"]);
      sectionRows.push(r);
      merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
      r = data.length;
      data.push(["Product", "BEG", "END"]);
      tableHeaderRows.push(r);
      for (const product of fullSection.products) {
        const fr = (dayData.full || {})[product] || {};
        const er = (dayData.empty || {})[product] || {};
        const beg = ((fr.beg as number) || 0) + ((er.beg as number) || 0);
        const end = fullSection.calcEnd(fr) + emptySection.calcEnd(er);
        data.push([product, beg, end]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!merges"] = merges;
    const colWidths = [{ wch: 20 }];
    for (let i = 0; i < 9; i++) colWidths.push({ wch: 10 });
    ws["!cols"] = colWidths;

    const range = XLSX.utils.decode_range(ws["!ref"] as string);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = (ws as Record<string, { s?: unknown }>)[addr];
        if (!cell) continue;
        if (R === 0) cell.s = boldSz(16);
        else if (R === 1) cell.s = boldSz(12);
        else if (sectionRows.includes(R)) cell.s = sectionHeader;
        else if (tableHeaderRows.includes(R)) cell.s = tableHeader;
        else if (subgroupRows.includes(R)) cell.s = subgroupHeader;
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, date);
  }

  XLSX.writeFile(wb, `Inventory_${inventoryDate}_to_${rangeEndDate}.xlsx`);
}
