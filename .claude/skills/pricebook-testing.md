---
name: pricebook-testing
description: Use when changing anything that touches pricebooks, pricing, or price lookups — creating/editing/activating/deactivating pricebooks, product→price mapping, or any sale that reads a price. Invoke before declaring pricebook-related work complete.
---

# Pricebook Testing — TankTracker

Pricing is the business. A pricing bug loses money on every affected sale until caught. This skill is the mandatory regression checklist for any pricebook-adjacent change.

## Invariants that must always hold

1. **Exactly zero or one active pricebook at any time.** Never two active. Activating a new one must deactivate the current active one atomically.
2. **At most one draft pricebook at any time.** The UI assumes `pricebooks.find(pb => pb.status === "draft")` returns a single result.
3. **Sales price against the pricebook active on the sale's date** — not today's active pricebook if backdating is allowed. (Confirm with PO if backdating is in scope for your change.)
4. **Deactivated pricebooks preserve historical prices** — never mutated after deactivation.
5. **Every product in the active pricebook must have prices for every category surface it appears in** — a cylinder without a refill price is a bug, not a feature.

## State transition matrix — test every cell that your change touches

|From → To          | active | draft | deactivated |
|-------------------|--------|-------|-------------|
| (none)            | create & activate | create draft | N/A |
| active            | N/A | N/A | activate another → this becomes deactivated |
| draft             | activate | edit in place | delete (if supported) |
| deactivated       | reactivate | N/A | N/A |

For each cell your change affects: manually walk the flow in the dev server. Confirm invariants hold after.

## Required manual tests after any pricebook change

Run these in the dev server:

1. **Create a new draft pricebook** — enter values, save as draft. Confirm it appears in the "Pricebooks" list with "Draft" badge.
2. **Create and activate** — use "Save & Activate". Confirm previous active is now in the "Pricebooks" list as "Deactivated", and the new one shows at top with "Active" badge.
3. **Edit draft** — open draft modal, change a price, save. Reopen — confirm value persisted.
4. **Reactivate a deactivated** — confirm the previously-active becomes deactivated and the reactivated one shows with "Active" badge.
5. **Defaulting** — create a new pricebook when there's no active one. Confirm defaults come from current product SRPs.
6. **Defaulting** — create a new pricebook when there IS an active one. Confirm defaults come from the active pricebook's prices, not from product SRPs.

## Regressions to check beyond pricebooks

- **Sales** — after a pricebook change, create a test sale and confirm the right prices load.
- **Dashboard** — any pricing aggregates still make sense.
- **All product categories** — if a new category exists (cylinder_deposit etc.), the pricebook modal shows it. See `safe-category-change` skill.

## Red flags

- You changed `onActivatePricebook` / `onCreatePricebook` / `onUpdatePricebook` without re-testing all state transitions.
- You moved data between fields in a Firestore pricebook doc. Old deactivated docs may break on read. Check backward compat.
- The "active" badge is showing in two places simultaneously. STOP — an invariant just broke.

## Delegate

Pass this skill's checklist explicitly to the `tester` agent when pricing is involved. The tester should produce a matrix of which cells it walked and the result for each.
