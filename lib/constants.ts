// ============================================================
// CONSTANTS
// ============================================================
import type { InventoryCell } from "./types";

// ---------------------------------------------------------------------------
// Shared building-block types
// ---------------------------------------------------------------------------

/** An accessory group used as input to all three builders. */
export interface AccessoryGroup {
  label: string;
  products: string[];
}

// ---------------------------------------------------------------------------
// Inventory section types
// ---------------------------------------------------------------------------

/**
 * A column descriptor inside an InventorySection.
 * Every column has field + label; the optional source flags are mutually
 * exclusive in practice but all optional for the type.
 */
export interface SectionColumn {
  /** The row-level key this column reads / writes. */
  field: string;
  label: string;
  /** True for computed columns (END, DIFF). */
  calc?: true;
  /** True for the AUDIT count column (editable number input). */
  auditSource?: true;
  /** True for the AUDIT REASON column (editable text input). */
  auditReason?: true;
  /** Sale-section key whose count populates this column. */
  salesSource?: string;
  /** Purchase-section key (or array of keys) whose counts are summed. */
  purchaseSource?: string | string[];
  /** Swap direction: "to" = outbound (full), "from" = inbound (empty). */
  swapSource?: "to" | "from";
  /**
   * Refund source descriptor.
   * When `defective` is explicitly `false`, only non-defective refunds are counted.
   * When `defective` is absent, all refunds for that section are counted.
   */
  refundSource?: { section: string; defective?: false };
  /** Cross-section source: pull the value from another resolved section's field. */
  source?: { section: string; field: string };
}

/** A resolved inventory section (full, empty, or accessories). */
export interface InventorySection {
  key: string;
  label: string;
  products: string[];
  color: string;
  columns: SectionColumn[];
  /** Compute the END value for a product row. */
  calcEnd: (r: Partial<InventoryCell>) => number;
  /** Present on the accessories section only. */
  subgroups?: AccessoryGroup[];
}

// ---------------------------------------------------------------------------
// Sales / purchase section types
// ---------------------------------------------------------------------------

/** A sales section (cylinderWithRefill | refill | accessories). */
export interface SalesSection {
  key: string;
  label: string;
  /** Present on cylinder sections; absent on the accessories section. */
  products?: string[];
  productCategory: string;
  srpField: string;
  /** Present on the accessories section only. */
  subgroups?: AccessoryGroup[];
}

/** A purchase section (cylinderWithRefill | refill | accessories). */
export interface PurchaseSection {
  key: string;
  label: string;
  /** Present on cylinder sections; absent on the accessories section. */
  products?: string[];
  productCategory: string;
  /** Present on the accessories section only. */
  subgroups?: AccessoryGroup[];
}

// ---------------------------------------------------------------------------
// Product seed type
// ---------------------------------------------------------------------------

export interface ProductSeedEntry {
  category: "cylinder" | "accessories";
  name: string;
  srp: number;
  srpRefill: number | null;
}

// ---------------------------------------------------------------------------
// Inventory section definitions — columns match the spreadsheet
// Cylinders automatically split into full and empty sub-categories
// ---------------------------------------------------------------------------
export function buildInventorySections(
  cylinderProducts: string[],
  accessoryGroups: AccessoryGroup[],
): InventorySection[] {
  const allAccessories = accessoryGroups.flatMap((g) => g.products);
  return [
    {
      key: "full",
      label: "FULL CYLINDER",
      products: cylinderProducts,
      color: "#f59e42",
      columns: [
        { field: "beg", label: "BEG" },
        { field: "planta", label: "PURCHASES", purchaseSource: ["cylinderWithRefill", "refill"] },
        { field: "sold", label: "SOLD FULL", salesSource: "cylinderWithRefill" },
        { field: "refillSales", label: "REFILL", salesSource: "refill" },
        { field: "swap", label: "SWAP", swapSource: "to" },
        { field: "returns", label: "RETURN", refundSource: { section: "fullCylinder", defective: false } },
        { field: "end", label: "END", calc: true },
        { field: "aud", label: "AUDIT", auditSource: true },
        { field: "audReason", label: "REASON", auditReason: true },
        { field: "var", label: "DIFF", calc: true },
      ],
      calcEnd: (r) =>
        (r.beg || 0) + (r.planta || 0) -
        (r.sold || 0) - (r.refillSales || 0) - (r.swap || 0) +
        (r.returns || 0),
    },
    {
      key: "empty",
      label: "EMPTY",
      products: cylinderProducts,
      color: "#3b82f6",
      columns: [
        { field: "beg", label: "BEG" },
        { field: "toPlanta", label: "PLANTA", source: { section: "full", field: "planta" } },
        { field: "refillIn", label: "REFILL", source: { section: "full", field: "refillSales" } },
        { field: "swapIn", label: "SWAP", swapSource: "from" },
        { field: "returned", label: "RETURNED", refundSource: { section: "emptyCylinder" } },
        { field: "end", label: "END", calc: true },
        { field: "aud", label: "AUDIT", auditSource: true },
        { field: "audReason", label: "REASON", auditReason: true },
        { field: "var", label: "DIFF", calc: true },
      ],
      calcEnd: (r) =>
        (r.beg || 0) - (r.toPlanta || 0) + (r.refillIn || 0) +
        (r.swapIn || 0) + (r.returned || 0),
    },
    {
      key: "accessories",
      label: "ACCESSORIES",
      products: allAccessories,
      color: "#22c55e",
      subgroups: accessoryGroups.filter((g) => g.products.length > 0),
      columns: [
        { field: "beg", label: "BEG" },
        { field: "delivery", label: "DELIVERY", purchaseSource: "accessories" },
        { field: "sold", label: "SOLD", salesSource: "accessories" },
        { field: "defective", label: "DEFECTIVE" },
        { field: "end", label: "END", calc: true },
        { field: "aud", label: "AUDIT", auditSource: true },
        { field: "audReason", label: "REASON", auditReason: true },
        { field: "var", label: "DIFF", calc: true },
      ],
      calcEnd: (r) =>
        (r.beg || 0) + (r.delivery || 0) - (r.sold || 0) - (r.defective || 0),
    },
  ];
}

// Sales sections — matches spreadsheet columns A-D
export function buildSalesSections(
  cylinderProducts: string[],
  accessoryGroups: AccessoryGroup[],
): SalesSection[] {
  return [
    {
      key: "cylinderWithRefill",
      label: "FULL CYLINDER",
      products: cylinderProducts,
      productCategory: "cylinder",
      srpField: "srp",
    },
    {
      key: "refill",
      label: "REFILL ONLY",
      products: cylinderProducts,
      productCategory: "cylinder",
      srpField: "srpRefill",
    },
    {
      key: "accessories",
      label: "ACCESSORIES",
      subgroups: accessoryGroups.filter((g) => g.products.length > 0),
      productCategory: "accessories",
      srpField: "srp",
    },
  ];
}

// Purchase sections — mirrors sales sections for the buying side
export function buildPurchaseSections(
  cylinderProducts: string[],
  accessoryGroups: AccessoryGroup[],
): PurchaseSection[] {
  return [
    {
      key: "cylinderWithRefill",
      label: "FULL CYLINDER",
      products: cylinderProducts,
      productCategory: "cylinder",
    },
    {
      key: "refill",
      label: "REFILL ONLY",
      products: cylinderProducts,
      productCategory: "cylinder",
    },
    {
      key: "accessories",
      label: "ACCESSORIES",
      subgroups: accessoryGroups.filter((g) => g.products.length > 0),
      productCategory: "accessories",
    },
  ];
}

// Product seed data for SRP
export const PRODUCT_SEED_DATA: ProductSeedEntry[] = [
  { category: "cylinder", name: "2.7KG", srp: 1489, srpRefill: 289 },
  { category: "cylinder", name: "2.7KG FIESTA", srp: 1489, srpRefill: 289 },
  { category: "cylinder", name: "7KG PASAK", srp: 2588, srpRefill: 688 },
  { category: "cylinder", name: "7KG RUSKAS", srp: 2588, srpRefill: 688 },
  { category: "cylinder", name: "11KG PASAK", srp: 3013, srpRefill: 1013 },
  { category: "cylinder", name: "11KG RUSKAS", srp: 3013, srpRefill: 1013 },
  { category: "cylinder", name: "ELITE PASAK", srp: 4738, srpRefill: 1038 },
  { category: "cylinder", name: "ELITE RUSKAS", srp: 4738, srpRefill: 1038 },
  { category: "cylinder", name: "22KG", srp: 5665, srpRefill: 1965 },
  { category: "cylinder", name: "50KG BLUE", srp: 9459, srpRefill: 4459 },
  { category: "cylinder", name: "50KG CODED", srp: 9459, srpRefill: 4459 },
  { category: "accessories", name: "REGULATOR (PASAK)", srp: 650, srpRefill: null },
  { category: "accessories", name: "REGULATOR (RUSKAS)", srp: 375, srpRefill: null },
  { category: "accessories", name: "GS-3", srp: 650, srpRefill: null },
  { category: "accessories", name: "HOSE", srp: 180, srpRefill: null },
  { category: "accessories", name: "CLAMP", srp: 20, srpRefill: null },
  { category: "accessories", name: "REYNA (SINGLE BURNER)", srp: 650, srpRefill: null },
  { category: "accessories", name: "REYNA (DOUBLE BURNER)", srp: 1200, srpRefill: null },
  { category: "accessories", name: "Y TYPE", srp: 150, srpRefill: null },
];
