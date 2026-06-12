import type { Pricebook, Product, ProductMap, ProductCategory } from "../../lib/types";

// A single product's price entry. Cylinders carry two prices (cylinder + refill);
// every other category carries a single srp. Shape is intentionally loose because
// it is persisted as-is and consumed by getPricebookSrp().
export type PriceEntry = {
  cylinder?: number;
  refill?: number;
  srp?: number;
};

// The pricebook `prices` map: productKey → PriceEntry.
export type PriceMap = Record<string, PriceEntry>;

// A product row enriched with its Firestore key, as grouped for the Products sub-tab.
export type ProductRow = Product & { key: string };

// productsByCategory: category → product rows in that category.
export type ProductsByCategory = Record<string, ProductRow[]>;

// Field edited within a price table row.
export type PriceField = "cylinder" | "refill" | "srp";

// Callback fired when a price input changes in an editable table.
export type PriceChangeFn = (productKey: string, field: PriceField, value: string) => void;

// Category metadata derived once in the parent and shared by both sub-tabs.
export interface CategoryMeta {
  // All product groups keyed by category (includes any non-default category).
  productsByCategory: ProductsByCategory;
  // Category keys: defaults (cylinder, accessories) merged with existing product categories.
  allCategories: string[];
  // Display label per category.
  categoryLabels: Record<string, string>;
  // Dot color per category.
  categoryColors: Record<string, string>;
  // Categories shown in pricebook modals, ordered cylinder → accessories → others.
  pricebookCategories: string[];
  // Product names within a category, ordered by sortOrder.
  productNamesInCategory: (cat: string) => string[];
}

// Handler signatures mirror the AppData hooks passed through the route page, so the
// route can pass data.createPricebook etc. directly without casts.
export type CreatePricebookFn = (
  name: string,
  effectiveDate: string,
  prices: Record<string, unknown>,
) => Promise<string | null>;

export type UpdatePricebookFn = (
  pricebookId: string,
  data: Partial<Omit<Pricebook, "id">>,
) => Promise<void>;

export type ActivatePricebookFn = (pricebookId: string) => Promise<void>;
export type DeletePricebookFn = (pricebookId: string) => Promise<void>;

export type AddProductFn = (category: ProductCategory, name: string) => Promise<void>;
export type UpdateProductFn = (productKey: string, updates: Partial<Product>) => Promise<void>;
export type DeleteProductFn = (productKey: string) => Promise<void>;

export type { Pricebook, Product, ProductMap, ProductCategory };
