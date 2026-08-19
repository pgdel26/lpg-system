// A plain module, not a hook: lib/receivables and lib/reports both group by
// customer and both are imported by the admin-SDK cron route, where pulling in
// a React module fails the build.

/** Canonical "is this the same customer" key.
 *
 *  Normalizes case and whitespace ONLY — not punctuation, so "SHAKEYS" and
 *  "SHAKEY'S" remain distinct. That is a known limitation, not an oversight:
 *  collapsing punctuation would also merge genuinely different accounts, and
 *  the call belongs to the operator. */
export function customerKey(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}
