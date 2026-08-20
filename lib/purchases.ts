/**
 * Shared purchase-line identity.
 *
 * Pure module (no lib/hooks import) so both the modal and the data hook can use
 * it — a hook importing a component would be the wrong direction, and three
 * hand-written copies of this format is precisely how they drift.
 *
 * Drift here is not cosmetic. The Edit Delivery form prefills a map keyed by this
 * function and its save diffs against the same keys, so a mismatch between the
 * two would show every quantity as blank and then read that blank as "the
 * operator deleted every line."
 */

/**
 * Identity of one purchase line within a delivery: its section plus its product.
 *
 * The product name alone is not enough — the same cylinder is bought both as
 * "FULL CYLINDER" and as "REFILL ONLY", so keying on the name would collide and
 * make two rows share one input.
 *
 * NUL separates the parts because no product name can contain it. A space (or
 * any printable character) could: a section "A" with product "B C" and a section
 * "A B" with product "C" would both key to "A B C".
 */
export const purchaseLineKey = (sectionKey: string, product: string) =>
  `${sectionKey}\u0000${product}`;
