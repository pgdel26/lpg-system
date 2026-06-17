import { categoryColor } from "../../lib/utils";
import type {
  ProductMap,
  PriceMap,
  ProductsByCategory,
  CategoryMeta,
} from "./pricingTypes";

// Categories never priced into a pricebook. The `borrowed` (utang-na-tangke)
// offering is deprecated, so it is excluded from default-price seeding.
// NOTE: this list existed in the original ProductsPage as `hiddenCategories`
// but its declaration had been dropped while one usage in buildDefaultPrices
// survived; it is restored here verbatim so the seeding branch behaves as designed.
const hiddenCategories = ["borrowed"];

// Build a default price map from the products collection. Cylinders get two
// prices (full-cylinder portion + refill); every other (non-hidden) category
// gets a single srp. Used when creating a pricebook with no active prices to
// copy from. Category branching preserved verbatim from ProductsPage.
export function buildDefaultPrices(products: ProductMap): PriceMap {
  const prices: PriceMap = {};
  for (const [key, prod] of Object.entries(products)) {
    if (hiddenCategories.includes(prod.category)) continue;
    if (prod.category === "cylinder") {
      prices[key] = {
        cylinder: (prod.srp || 0) - (prod.srpRefill || 0),
        refill: prod.srpRefill || 0,
      };
    } else {
      prices[key] = { srp: prod.srp || 0 };
    }
  }
  return prices;
}

// Dynamic product name lists from Firestore products (for pricebook tables).
export function productNamesInCategory(products: ProductMap, cat: string): string[] {
  return Object.entries(products)
    .filter(([, p]) => p.category === cat)
    .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0))
    .map(([, p]) => p.name);
}

// Derive all category metadata shared between the Products and Pricing sub-tabs.
// Grouping, default categories, color/label defaults, and the pricebook ordering
// all preserved verbatim from ProductsPage.
export function buildCategoryMeta(products: ProductMap): CategoryMeta {
  // Grouped products for the Products sub-tab
  const productsByCategory: ProductsByCategory = Object.entries(products).reduce(
    (acc, [key, prod]) => {
      const cat = prod.category || "unknown";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push({ key, ...prod });
      return acc;
    },
    {} as ProductsByCategory,
  );

  const defaultCategories: Record<string, string> = { cylinder: "Cylinder", accessories: "Accessories" };
  // Build dynamic category list from existing products + defaults
  const allCategories = Object.keys({ ...defaultCategories, ...productsByCategory });
  const categoryLabels: Record<string, string> = { ...defaultCategories };
  allCategories.forEach((cat) => {
    if (!categoryLabels[cat]) categoryLabels[cat] = cat.charAt(0).toUpperCase() + cat.slice(1);
  });
  // Canonical, name-derived colors shared with the Inventory sections
  // (lib/utils.categoryColor) so a category is the same color on every screen.
  const categoryColors: Record<string, string> = {};
  allCategories.forEach((cat) => { categoryColors[cat] = categoryColor(cat); });

  // Categories shown in pricebook modals: only those with products, ordered
  // cylinder → accessories → other categories alphabetically.
  const pricebookCategories = Object.keys(productsByCategory).sort((a, b) => {
    if (a === "cylinder") return -1;
    if (b === "cylinder") return 1;
    if (a === "accessories") return -1;
    if (b === "accessories") return 1;
    return a.localeCompare(b);
  });

  return {
    productsByCategory,
    allCategories,
    categoryLabels,
    categoryColors,
    pricebookCategories,
    productNamesInCategory: (cat: string) => productNamesInCategory(products, cat),
  };
}
