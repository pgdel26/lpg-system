import * as XLSX from "xlsx-js-style";
import { buildSalesReportWorkbook } from "../../lib/reports/salesReport";
import type { SalesReportInput } from "../../lib/reports/salesReport";

// Builds and downloads the full Sales Report workbook for a given day.
// Mirrors exportFullReport in the old TransactionsPage.js verbatim.
export function exportFullReport(input: SalesReportInput): void {
  const wb = buildSalesReportWorkbook(input);
  XLSX.writeFile(wb, `Sales_Report_${input.date}.xlsx`);
}
