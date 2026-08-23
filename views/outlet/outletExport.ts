import * as XLSX from "xlsx-js-style";
import { buildSalesReportSheet, type SalesReportInput } from "../../lib/reports/salesReport";
import { buildInventorySheet } from "../inventory/inventoryExport";
import { saleSectionLabel } from "../../lib/utils";
import type { SaleTransaction, Swap, Refund, InventoryState } from "../../lib/types";
import type { InventorySection } from "../../lib/constants";

// ---------------------------------------------------------------------------
// One workbook, three sheets — one per tab on the outlet page.
//
// Sheets rather than three files in a zip: the sheet builders already exist, so
// this needs no new dependency, and the three datasets stay together when the
// file is filed or emailed.
//
// Sheet 1 (Sales Report) and Sheet 3 (Inventory) are the EXISTING builders,
// untouched — sheet 1 in particular is what the operator remits against, so it
// is not re-derived here. Sheet 2 is new: the Sales Report's own "DAILY SALES"
// section lists sales per invoice only, while the Daily Sales tab also shows
// swaps and refunds as rows. That's the content this sheet adds.
// ---------------------------------------------------------------------------

const boldSz = (sz: number) => ({ font: { bold: true, sz } });
const sectionHeader = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
const tableHeader = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
const totalRowStyle = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };
const numFmt = "#,##0.00";

const timeOf = (createdAt: unknown): number => {
  const ts = createdAt as { toDate?: () => Date; seconds?: number } | null | undefined;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  return 0;
};

const clockLabel = (at: number): string =>
  at === 0 ? "" : new Date(at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

export interface DailySalesSheetInput {
  date: string;
  branchName: string;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
}

interface ActivityRow {
  at: number;
  invoice: string;
  kind: string;
  description: string;
  qty: number | string;
  amount: number;
}

export function buildDailySalesSheet({
  date, branchName, saleTransactions, swaps, refunds,
}: DailySalesSheetInput): XLSX.WorkSheet {
  const rows: ActivityRow[] = [
    ...saleTransactions.map((t): ActivityRow => ({
      at: timeOf(t.createdAt),
      invoice: t.invoice || "",
      kind: `Sale — ${saleSectionLabel(t.saleSection)}`,
      description: t.product || "",
      qty: t.quantity || 0,
      amount: Number(t.totalAmount) || 0,
    })),
    ...swaps.map((s): ActivityRow => ({
      at: timeOf(s.createdAt),
      invoice: "",
      kind: "Swap",
      description: `${s.productFrom || "?"} → ${s.productTo || "?"}`,
      qty: "",
      amount: Number(s.price) || 0,
    })),
    ...refunds.map((r): ActivityRow => ({
      at: timeOf(r.createdAt),
      invoice: r.invoice || "",
      kind: "Refund / Return",
      description: (r.items || []).map((i) => `${i.qty}x ${i.product}`).join(", "),
      qty: (r.items || []).reduce((sum, i) => sum + (Number(i.qty) || 0), 0),
      // Negative: money going back out, so a reader can't scan it as income and
      // the column total is the day's net movement.
      amount: -(Number(r.totalRefund) || 0),
    })),
  ].sort((a, b) => a.at - b.at);

  const data: Array<Array<string | number>> = [];
  data.push(["DAILY SALES"]);
  data.push([`${branchName} · ${date}`]);
  data.push([]);

  const headerRow = data.length;
  data.push(["Time", "Invoice", "Type", "Item", "Qty", "Amount"]);

  for (const row of rows) {
    data.push([clockLabel(row.at), row.invoice, row.kind, row.description, row.qty, row.amount]);
  }
  if (rows.length === 0) data.push(["No activity recorded.", "", "", "", "", ""]);

  const totalRow = data.length;
  // Centavos, then divide once. A float column of .50s drifts, and this cell is
  // reconciled against the Sales Report sheet in the same workbook.
  const netCentavos = rows.reduce((sum, r) => sum + Math.round((Number(r.amount) || 0) * 100), 0);
  data.push(["", "", "", "", "Net", netCentavos / 100]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 8 }, { wch: 14 }];

  const setStyle = (r: number, c: number, style: Record<string, unknown>) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    ws[addr].s = { ...(ws[addr].s || {}), ...style };
  };

  setStyle(0, 0, sectionHeader);
  setStyle(1, 0, boldSz(11));
  for (let c = 0; c < 6; c++) {
    setStyle(headerRow, c, tableHeader);
    setStyle(totalRow, c, totalRowStyle);
  }
  for (let r = headerRow + 1; r <= totalRow; r++) setStyle(r, 5, { numFmt });

  return ws;
}

export interface OutletExportInput {
  date: string;
  branchName: string;
  salesReport: SalesReportInput;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  resolvedInventory: InventoryState;
  totalCylinderData: Array<{ product: string; beg: number; end: number }>;
  inventorySections: InventorySection[];
}

export function exportOutletWorkbook({
  date, branchName, salesReport,
  saleTransactions, swaps, refunds,
  resolvedInventory, totalCylinderData, inventorySections,
}: OutletExportInput): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSalesReportSheet(salesReport), "Sales Report");
  XLSX.utils.book_append_sheet(
    wb,
    buildDailySalesSheet({ date, branchName, saleTransactions, swaps, refunds }),
    "Daily Sales",
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildInventorySheet({
      resolvedInventory, totalCylinderData, inventorySections,
      inventoryDate: date,
    }),
    "Inventory",
  );

  const safeName = branchName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Outlet";
  XLSX.writeFile(wb, `${safeName}_${date}.xlsx`);
}
