import * as XLSX from "xlsx-js-style";
import { titleCaseCategory } from "../utils";
import { customerKey, NO_CUSTOMER_KEY, NO_CUSTOMER_LABEL } from "../customers";
import { categoryOf, saleUnits } from "../productCategory";
import type { SaleTransaction } from "../types";

// ---------------------------------------------------------------------------
// Monthly Sales — pure aggregation.
//
// Named "Product Sales" until 2026-08-29; the file and its exports keep the
// productSales spelling, which is only ever seen in code.
//
// One row per PRODUCT, one column per MONTH, showing UNITS SOLD only. No
// Firestore here; the range fetch lives in lib/hooks/useSalesRangeData.ts, and
// this module stays importable by the cron route (see the lib/* server-reachable
// rule in CLAUDE.md). No peso
// figures, and no variance column either: the owner asked for quantity and
// nothing else, twice. The money view of a period lives on the Income
// Statement, which is where that rule is defined (lib/reports/billed.ts) — a
// second, half-stated copy of it here is how two reports start disagreeing.
//
// The columns are a TRAILING WINDOW of whole months (see trailingMonths in
// lib/utils.ts), so the trend is the report: a reader compares the columns
// themselves rather than reading a computed delta someone else chose the
// endpoints for. That is also why the periods arrive as a list of windows over
// ONE fetched array rather than one fetch each — consecutive months are a
// single contiguous span, so six columns cost one query.
//
// BUCKET KEY IS `category|product`, NOT the product name alone. Everywhere else
// in this codebase a product's identity is `${category}_${name}` (products doc
// ids, pricebook keys, useSalesData's prodKey), and name-only is a weaker key
// than the system's own: a `borrowed` or `cylinder_deposit` document whose
// product name mirrors a cylinder's would be silently added into that
// cylinder's count. A lent tank and a refundable deposit are not units sold,
// and the operator would have no way to see them in the number.
//
// Keying on category is also what collapses Refill and Full Cylinder into one
// row per cylinder (the owner's ask) — both sale sections carry
// productCategory "cylinder", so they land in the same bucket for free rather
// than through a section allowlist. Per-type counts live on Volume Per Customer.
//
// A category is only ever spelled out in a row's label when the SAME product
// name appears under more than one category — and that ambiguity is judged
// across the WHOLE window at once, not month by month. Judged per month, a
// product that is ambiguous in one column and not in another would print as
// "11KG PASAK" beside "11KG PASAK (Borrowed)" on the same row, which reads as
// two different products sharing a line.
//
// NO CATEGORY FILTER, still: every sale document in range is counted, whatever
// its category — a hardcoded allowlist is the bug class
// .claude/skills/safe-category-change.md exists to prevent. Categories are used
// to SEPARATE rows here, never to drop them.
//
// EVERY product that sold in the window gets a row — there is no product
// selection here. The screen's search box narrows the rows on display only, so
// the aggregate this returns (and the workbook it exports) is always the whole
// window; a search can never quietly reshape the figures someone acts on.
//
// SALES ONLY, and GROSS OF RETURNS — swaps and refunds are absent. A swap
// exchanges one cylinder for another and moves no new units; a refund's line
// items use a different section vocabulary and have their own screen
// (/refunds). A cylinder sold and later returned is still counted here, which
// is why the screen and the workbook both say so out loud: this is what was
// sold, not what physically left the yard.
// ---------------------------------------------------------------------------

/**
 * One column of the report: a date window and the heading it prints under.
 *
 * Windows are expected to be DISJOINT and in chronological order — which whole
 * calendar months are, by construction. A sale is counted in the first window
 * that contains it, so overlapping windows would quietly count it once rather
 * than in both, and the columns would no longer sum to the window's real total.
 */
export interface ProductSalesPeriod {
  /** "YYYY-MM-DD" inclusive bounds. */
  startDate: string;
  endDate: string;
  /** Column heading, e.g. "Aug 2026". */
  label: string;
  /** True for a month that hasn't finished yet — the screen says so out loud. */
  partial?: boolean;
}

export interface ProductSalesRow {
  /** `category|product` — unique per row, and the React key. */
  key: string;
  /** Product name as written on the sale documents. */
  product: string;
  /**
   * The category this row's sales were booked under. Carried so the per-customer
   * breakdown can re-select exactly this row's documents — parsing it back out
   * of `key` would break the moment a product name contained a "|".
   */
  category: string;
  /**
   * What the screen and the workbook print. Equals `product`, except where the
   * same name exists under several categories in range — then it carries the
   * category, e.g. "11KG PASAK (Cylinder Deposit)".
   */
  label: string;
  /** Units sold, one entry per period, index-aligned with the input periods. */
  quantities: number[];
  /**
   * Units across the whole window. Sorts the table; deliberately NOT displayed —
   * the owner asked for the monthly figures and nothing beside them.
   */
  combined: number;
}

export interface ProductSalesReport {
  rows: ProductSalesRow[];
  /** Total units per period, index-aligned with the input periods. */
  totals: number[];
}

export interface ProductSalesInput {
  /**
   * Every sale document across the WHOLE window, unsorted. One fetch spanning
   * the first period's start to the last period's end — the periods below slice
   * it into columns.
   */
  saleTransactions: SaleTransaction[];
  /** The columns, oldest first. At least one. */
  periods: ProductSalesPeriod[];
  /** Branch id to restrict to; omit/empty for all outlets combined. */
  branch?: string;
}

export function buildProductSalesReport({
  saleTransactions,
  periods,
  branch,
}: ProductSalesInput): ProductSalesReport {
  const width = periods.length;

  /** `category|product` -> units per period. */
  const buckets = new Map<string, { product: string; category: string; quantities: number[] }>();
  /** product name -> the categories it was sold under, across the whole window. */
  const categoriesByProduct = new Map<string, Set<string>>();

  for (const sale of saleTransactions) {
    if (!sale.date) continue;
    if (branch && sale.branch !== branch) continue;

    // Which column this sale falls in. A fetch spans the whole window, so a
    // document outside every period (an off-by-one at either edge) is dropped
    // rather than folded into the nearest month.
    const index = periods.findIndex(
      (p) => sale.date >= p.startDate && sale.date <= p.endDate,
    );
    if (index === -1) continue;

    const product = sale.product || "(unnamed)";

    const category = categoryOf(sale);
    let seen = categoriesByProduct.get(product);
    if (!seen) {
      seen = new Set<string>();
      categoriesByProduct.set(product, seen);
    }
    seen.add(category);

    const key = `${category}|${product}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      // Zero-filled to the full width up front, so a product that only started
      // selling last month still has a real 0 in the earlier columns rather
      // than a hole the view has to guess at.
      bucket = { product, category, quantities: new Array(width).fill(0) };
      buckets.set(key, bucket);
    }
    // saleUnits, not an inline `|| 1` — see lib/productCategory.ts for why a
    // missing quantity is one unit and not zero.
    bucket.quantities[index] += saleUnits(sale);
  }

  const rows: ProductSalesRow[] = [...buckets.entries()].map(([key, b]) => {
    const ambiguous = (categoriesByProduct.get(b.product)?.size || 0) > 1;
    return {
      key,
      product: b.product,
      category: b.category,
      label: ambiguous && b.category ? `${b.product} (${titleCaseCategory(b.category)})` : b.product,
      quantities: b.quantities,
      combined: b.quantities.reduce((sum, q) => sum + q, 0),
    };
  });

  // Biggest seller over the WHOLE window first, not over the newest month: the
  // months are consecutive, so the total is a real six-month figure, and
  // ranking on it keeps the order steady as a new month rolls in instead of
  // reshuffling the table on one quiet week. Ties fall to the latest month,
  // then alphabetically so the order can't shuffle between renders — sort is
  // stable, but the Firestore result order isn't.
  rows.sort((a, b) =>
    b.combined - a.combined
    || b.quantities[width - 1] - a.quantities[width - 1]
    || a.label.localeCompare(b.label));

  return {
    rows,
    totals: periods.map((_, i) => rows.reduce((sum, r) => sum + r.quantities[i], 0)),
  };
}

/**
 * One row per CUSTOMER for a single product — what the screen shows when a
 * product row is expanded.
 *
 * Computed on demand for the one product being opened rather than for every row
 * up front: the window holds thousands of sale documents, and a full
 * product×customer matrix would be built on every render to show one row of it.
 *
 * Selects on (product, category), the same pair that formed the row — matching
 * on the name alone would fold a `cylinder_deposit` of the same name into a
 * cylinder's breakdown, which is exactly what the row-level bucket key exists to
 * prevent.
 */
export interface ProductCustomerRow {
  /** customerId when present, else the normalised name — the React key. */
  key: string;
  name: string;
  /** Units per period, index-aligned with the input periods. */
  quantities: number[];
  /** Units across the whole window. Sorts the breakdown, biggest buyer first. */
  combined: number;
}

export interface ProductCustomerInput {
  saleTransactions: SaleTransaction[];
  periods: ProductSalesPeriod[];
  branch?: string;
  /** The row being expanded — both halves of its bucket key. */
  product: string;
  category: string;
}

export function buildProductCustomerRows({
  saleTransactions,
  periods,
  branch,
  product,
  category,
}: ProductCustomerInput): ProductCustomerRow[] {
  const width = periods.length;
  const buckets = new Map<string, { name: string; nameDate: string; quantities: number[] }>();

  for (const sale of saleTransactions) {
    if (!sale.date) continue;
    if (branch && sale.branch !== branch) continue;
    if ((sale.product || "(unnamed)") !== product) continue;
    if (categoryOf(sale) !== category) continue;

    const index = periods.findIndex((p) => sale.date >= p.startDate && sale.date <= p.endDate);
    if (index === -1) continue;

    const name = (sale.customerName || "").trim();
    // customerKey(), not the raw name: "same customer" has to mean here what it
    // means on Customers and Receivables, or a still-unmerged duplicate splits
    // into two rows that each look like a smaller buyer than they are.
    const key = sale.customerId || (name ? customerKey(name) : "") || NO_CUSTOMER_KEY;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { name: name || NO_CUSTOMER_LABEL, nameDate: sale.date, quantities: new Array(width).fill(0) };
      buckets.set(key, bucket);
    } else if (name && sale.date >= bucket.nameDate) {
      // Renames cascade across documents, but older ones may still hold the old
      // name — let the most recent document win so the row reads correctly.
      bucket.name = name;
      bucket.nameDate = sale.date;
    }
    bucket.quantities[index] += saleUnits(sale);
  }

  const rows = [...buckets.entries()].map(([key, b]) => ({
    key,
    name: b.name,
    quantities: b.quantities,
    combined: b.quantities.reduce((sum, q) => sum + q, 0),
  }));

  // Biggest buyer over the whole window first, matching how the product rows
  // themselves are ranked. Ties fall alphabetically so the order can't shuffle
  // between renders.
  rows.sort((a, b) => b.combined - a.combined || a.name.localeCompare(b.name));
  return rows;
}

// ---------------------------------------------------------------------------
// Excel export. Same xlsx-js-style pattern as incomeStatement.ts and
// customerOrders.ts, so every report in the app exports the same way.
// ---------------------------------------------------------------------------

export interface ProductSalesWorkbookInput {
  report: ProductSalesReport;
  /** The same periods the report was built from, for the column headers. */
  periods: ProductSalesPeriod[];
  /** Outlet name to stamp on the sheet; omit for all outlets combined. */
  branchName?: string;
}

export function buildProductSalesWorkbook({
  report,
  periods,
  branchName,
}: ProductSalesWorkbookInput): XLSX.WorkBook {
  const bold = (sz: number): Record<string, unknown> => ({ font: { bold: true, sz } });
  const headerStyle: Record<string, unknown> = { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "center", wrapText: true } };
  const totalStyle: Record<string, unknown> = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };
  // Units, never money — no decimals.
  const whole = "#,##0";

  const first = periods[0];
  const last = periods[periods.length - 1];

  const data: (string | number | null)[][] = [];
  const merges: XLSX.Range[] = [];
  const lastCol = periods.length; // Product + one per month

  data.push(["Monthly Sales"]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });
  data.push([`${first.label} to ${last.label}  •  ${branchName || "All outlets"}`]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  // Stays on the SHEET though the owner cut it from the screen: a workbook is
  // mailed on and read by people who never saw this app, and a bold TOTAL ITEMS
  // with no statement of basis is exactly the shape of a figure someone
  // reconciles against stock movement. The screen has the app around it; the
  // sheet has only what is printed on it.
  data.push(["Units sold. Excludes swaps and returns — a cylinder sold and later returned is still counted here."]);
  merges.push({ s: { r: data.length - 1, c: 0 }, e: { r: data.length - 1, c: lastCol } });
  data.push([]);

  const headerRow = data.length;
  data.push(["Product", ...periods.map((p) => (p.partial ? `${p.label} (to date)` : p.label))]);

  for (const row of report.rows) data.push([row.label, ...row.quantities]);

  const totalRow = data.length;
  // "TOTAL ITEMS", not "TOTAL": this adds cylinders to lighters to hoses. The
  // arithmetic is right, the unit isn't one thing, and a bare "TOTAL" is the
  // shape of a figure people reconcile against.
  data.push(["TOTAL ITEMS", ...report.totals]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 34 }, ...periods.map(() => ({ wch: 13 }))];

  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      if (R === 0) ws[addr].s = bold(14);
      else if (R === 1) ws[addr].s = bold(11);
      else if (R === headerRow) ws[addr].s = headerStyle;
      else if (R === totalRow) {
        ws[addr].s = { ...totalStyle };
        if (typeof ws[addr].v === "number") ws[addr].s.numFmt = whole;
      } else if (typeof ws[addr].v === "number") {
        ws[addr].s = { numFmt: whole };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Monthly Sales");
  return wb;
}

/** Builds and downloads the Monthly Sales workbook. */
export function exportProductSalesWorkbook(input: ProductSalesWorkbookInput): void {
  const wb = buildProductSalesWorkbook(input);
  const outlet = input.branchName ? `_${input.branchName.replace(/[^A-Za-z0-9]+/g, "-")}` : "";
  const first = input.periods[0];
  const last = input.periods[input.periods.length - 1];
  XLSX.writeFile(wb, `Monthly_Sales${outlet}_${first.startDate}_to_${last.endDate}.xlsx`);
}
