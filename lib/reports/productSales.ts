import * as XLSX from "xlsx-js-style";
import { titleCaseCategory } from "../utils";
import type { SaleTransaction } from "../types";

// ---------------------------------------------------------------------------
// Product Sales — pure aggregation.
//
// One row per PRODUCT over a date range, showing UNITS SOLD only. No Firestore
// here; the range fetch lives in lib/hooks/useSalesRangeData.ts, and this
// module stays importable by the cron route (see the lib/* server-reachable
// rule in CLAUDE.md). No peso
// figures: the owner asked for quantity and nothing else. The money view of a
// period lives on the Income Statement, which is where that rule is defined
// (lib/reports/billed.ts) — a second, half-stated copy of it here is how two
// reports start disagreeing.
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
// than through a section allowlist. Per-type counts live on Customer Orders.
//
// A category is only ever spelled out in a row's label when the SAME product
// name appears under more than one category in range. The common case stays
// "11KG PASAK"; the ambiguous case becomes "11KG PASAK (Borrowed)" so two rows
// can never look like a duplicate.
//
// NO CATEGORY FILTER, still: every sale document in range is counted, whatever
// its category — a hardcoded allowlist is the bug class
// .claude/skills/safe-category-change.md exists to prevent. Categories are used
// to SEPARATE rows here, never to drop them.
//
// SALES ONLY, and GROSS OF RETURNS — swaps and refunds are absent. A swap
// exchanges one cylinder for another and moves no new units; a refund's line
// items use a different section vocabulary and have their own screen
// (/refunds). A cylinder sold and later returned is still counted here, which
// is why the screen and the workbook both say so out loud: this is what was
// sold, not what physically left the yard.
// ---------------------------------------------------------------------------

/**
 * Sale sections that represent a cylinder. Used ONLY to derive a category for a
 * legacy document that predates `productCategory`; nothing is included or
 * excluded on the basis of this list.
 */
const CYLINDER_SECTIONS = ["refill", "cylinderWithRefill"];

/**
 * The category a sale document belongs to. Falls back to the sale section for
 * old documents with no `productCategory`: a single-price section's key IS its
 * category (see buildSalesSections), and the two cylinder sections both mean
 * "cylinder". Without this a product would split across two rows depending on
 * which documents happened to carry the field.
 */
const categoryOf = (sale: Pick<SaleTransaction, "productCategory" | "saleSection">): string => {
  if (sale.productCategory) return sale.productCategory;
  const section = sale.saleSection || "";
  return CYLINDER_SECTIONS.includes(section) ? "cylinder" : section;
};

export interface ProductSalesRow {
  /** `category|product` — unique per row, and the React key. */
  key: string;
  /** Product name as written on the sale documents. */
  product: string;
  /**
   * What the screen and the workbook print. Equals `product`, except where the
   * same name exists under several categories in range — then it carries the
   * category, e.g. "11KG PASAK (Cylinder Deposit)".
   */
  label: string;
  quantity: number;
  /**
   * True when this product was explicitly selected but has no sales in range.
   * Distinct from a product that sold and came to zero — the screen says so.
   */
  noActivity: boolean;
}

export interface ProductSalesReport {
  rows: ProductSalesRow[];
  /** Total units across every row shown. */
  totalQuantity: number;
  /** Products with sales in range, whether or not they were selected. */
  productsWithSales: string[];
}

export interface ProductSalesInput {
  saleTransactions: SaleTransaction[];
  /** "YYYY-MM-DD" inclusive bounds. */
  startDate: string;
  endDate: string;
  /** Branch id to restrict to; omit/empty for all outlets combined. */
  branch?: string;
  /**
   * Products to report on. EMPTY MEANS ALL — and "all" means every product
   * that actually sold, not the whole catalog, so an unfiltered report opens on
   * real activity rather than a wall of zeros. Name a product explicitly and it
   * gets a row even with no sales, because "we sold none of these" is the
   * answer someone ticking a specific box is looking for.
   */
  selectedProducts?: string[];
}

export function buildProductSalesReport({
  saleTransactions,
  startDate,
  endDate,
  branch,
  selectedProducts,
}: ProductSalesInput): ProductSalesReport {
  const selection = selectedProducts && selectedProducts.length > 0
    ? new Set(selectedProducts)
    : null;

  /** `category|product` -> units. */
  const buckets = new Map<string, { product: string; category: string; quantity: number }>();
  const productsWithSales = new Set<string>();
  /** product name -> the categories it was sold under, for disambiguation. */
  const categoriesByProduct = new Map<string, Set<string>>();

  for (const sale of saleTransactions) {
    if (!sale.date) continue;
    if (sale.date < startDate || sale.date > endDate) continue;
    if (branch && sale.branch !== branch) continue;

    const product = sale.product || "(unnamed)";
    productsWithSales.add(product);
    if (selection && !selection.has(product)) continue;

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
      bucket = { product, category, quantity: 0 };
      buckets.set(key, bucket);
    }
    // `|| 1`, NOT `|| 0`, and deliberately so: every money and inventory
    // consumer of this same field treats a missing quantity as one unit
    // (salesReport.ts's grossSales, incomeStatement.ts's gross, useSalesData's
    // inventory SOLD feed). A handful of legacy documents predate the field,
    // and counting them as zero here while the Income Statement prices them as
    // one is a discrepancy with no visible cause. Today's writer always writes
    // a quantity of at least 1, so this can never swallow a genuine zero.
    bucket.quantity += Number(sale.quantity) || 1;
  }

  // A selected product with no sales still gets its row, at zero. It has no
  // category of its own — nothing was sold to give it one — so it is keyed
  // under "" and labelled with the bare name.
  if (selection) {
    for (const product of selection) {
      if (!productsWithSales.has(product)) {
        buckets.set(`|${product}`, { product, category: "", quantity: 0 });
      }
    }
  }

  const rows: ProductSalesRow[] = [...buckets.entries()].map(([key, b]) => {
    const ambiguous = (categoriesByProduct.get(b.product)?.size || 0) > 1;
    return {
      key,
      product: b.product,
      label: ambiguous && b.category ? `${b.product} (${titleCaseCategory(b.category)})` : b.product,
      quantity: b.quantity,
      noActivity: !productsWithSales.has(b.product),
    };
  });

  // Best seller first. Ties break alphabetically so the order can't shuffle
  // between renders — sort is stable, but the Firestore result order isn't.
  // Zero rows fall to the bottom on their own.
  rows.sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));

  return {
    rows,
    totalQuantity: rows.reduce((sum, r) => sum + r.quantity, 0),
    productsWithSales: [...productsWithSales].sort((a, b) => a.localeCompare(b)),
  };
}

// ---------------------------------------------------------------------------
// Excel export. Same xlsx-js-style pattern as incomeStatement.ts and
// customerOrders.ts, so every report in the app exports the same way.
// ---------------------------------------------------------------------------

export interface ProductSalesWorkbookInput {
  report: ProductSalesReport;
  startDate: string;
  endDate: string;
  /** Outlet name to stamp on the sheet; omit for all outlets combined. */
  branchName?: string;
  /** How many products were ticked, so a filtered export says so on its face. */
  selectedCount?: number;
}

export function buildProductSalesWorkbook({
  report,
  startDate,
  endDate,
  branchName,
  selectedCount,
}: ProductSalesWorkbookInput): XLSX.WorkBook {
  const bold = (sz: number): Record<string, unknown> => ({ font: { bold: true, sz } });
  const headerStyle: Record<string, unknown> = { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "center", wrapText: true } };
  const totalStyle: Record<string, unknown> = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };
  // Units, never money — no decimals.
  const whole = "#,##0";

  const data: (string | number | null)[][] = [];
  const merges: XLSX.Range[] = [];
  const lastCol = 1; // Product + Qty Sold

  data.push(["Product Sales"]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });
  data.push([`${startDate} to ${endDate}  •  ${branchName || "All outlets"}`]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  if (selectedCount) {
    data.push([`Filtered to ${selectedCount} selected product${selectedCount === 1 ? "" : "s"} — this is not every product.`]);
    merges.push({ s: { r: data.length - 1, c: 0 }, e: { r: data.length - 1, c: lastCol } });
  }
  data.push(["Units sold. Excludes swaps and returns — a cylinder sold and later returned is still counted here."]);
  merges.push({ s: { r: data.length - 1, c: 0 }, e: { r: data.length - 1, c: lastCol } });
  data.push([]);

  const headerRow = data.length;
  data.push(["Product", "Qty Sold"]);

  for (const row of report.rows) data.push([row.label, row.quantity]);

  const totalRow = data.length;
  // "TOTAL ITEMS", not "TOTAL": this adds cylinders to lighters to hoses. The
  // arithmetic is right, the unit isn't one thing, and a bare "TOTAL" is the
  // shape of a figure people reconcile against.
  data.push(["TOTAL ITEMS", report.totalQuantity]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 34 }, { wch: 12 }];

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
  XLSX.utils.book_append_sheet(wb, ws, "Product Sales");
  return wb;
}

/** Builds and downloads the Product Sales workbook. */
export function exportProductSalesWorkbook(input: ProductSalesWorkbookInput): void {
  const wb = buildProductSalesWorkbook(input);
  const outlet = input.branchName ? `_${input.branchName.replace(/[^A-Za-z0-9]+/g, "-")}` : "";
  XLSX.writeFile(wb, `Product_Sales${outlet}_${input.startDate}_to_${input.endDate}.xlsx`);
}
