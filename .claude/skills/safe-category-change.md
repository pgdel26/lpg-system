---
name: safe-category-change
description: Use whenever a change touches product categories in TankTracker — adding a new category, changing how categories are filtered, or working on pricing/products/sales flows. Also trigger when you see `p.category ===`, `category === "cylinder"`, or `category === "accessories"` in the diff or planned change. This prevents a known recurring bug class.
---

# Safe Category Change — TankTracker

## The hazard

TankTracker has a recurring bug class: product categories get hardcoded into filters, so new categories (like `cylinder_deposit`) silently disappear from some UI surfaces while showing up in others. The Products subtab uses dynamic categories; several pricing flows do not.

**A new category is only "done" when every one of these surfaces handles it correctly.**

## Category-touching surfaces — check every one

For any category-related change, grep the codebase for `p.category` and `.category ===` and verify each call site handles your new category or change correctly. Confirmed surfaces as of this skill's writing:

1. **Products subtab** — `views/ProductsPage.js`, `productsByCategory` reducer. Groups by any category.
2. **New Pricebook modal** — `views/ProductsPage.js`, `dynamicFullProducts` + `dynamicAccessoryProducts`. Hardcoded to `cylinder` and `accessories`.
3. **Edit Draft Pricebook modal** — same two filters as above.
4. **View Deactivated Pricebook modal** — same two filters.
5. **`buildDefaultPrices()`** — only branches on `cylinder` and `accessories`.
6. **Sale modal** — `components/SaleModal.js`. Check how it lists sellable products.
7. **Dashboard** — `views/DashboardPage.js`. Check any per-category aggregates.
8. **`handleAddProduct`** — `app/page.js`. The `srpRefill` defaulting is category-aware.

Re-grep before each change — the codebase evolves.

## Required procedure

1. **Before coding**, grep for every `category` reference and list the surfaces your change affects.
2. **Get PO input** (spawn `product-owner` agent) on how the new category should behave in each surface — single-price? two-price (full + refill)? hidden from sales?
3. **Implement**. Prefer removing hardcoded category lists over adding another hardcoded branch. When truly category-specific behavior is needed, centralize the category metadata in one place.
4. **Tester must verify every surface** — pass the list from step 1 to the `tester` agent explicitly.

## Red flags

- You're adding `else if (category === "new_thing")` — STOP. You're extending the hardcoded-category pattern. Refactor to category metadata instead, or get explicit user approval that hardcoding is the right call here.
- You're filtering for two specific categories in a new piece of code — STOP. Ask whether the filter should be "all non-hidden categories" or "everything in `productsByCategory`".
- A test passed on the Products subtab but you didn't check the three pricing modals — STOP. Test the three modals.

## Reference: the April 2026 deposit bug

A `cylinder_deposit` product was added via the Products subtab. It showed there but was invisible in the New Pricebook modal because of the hardcoded filter. See memory `project_pending_deposit_bug.md` for the original report.
