// Customer identity rule, in a plain module rather than inside
// hooks/useCustomersData so server-reachable code can use it too:
// lib/receivables.ts is imported by the admin-SDK cron route
// (app/api/cron/daily-reports), and pulling in a React hook module there
// breaks the build. useCustomersData re-exports this so existing client
// imports keep working.

/** Canonical "is this the same customer" key. Every surface that groups by
 *  customer (Receivables, Top Debtors, the A/R roll-forward, the Income
 *  Statement's discount breakdown) must use this instead of a second,
 *  driftable copy of the rule.
 *
 *  Deliberately normalizes case and whitespace ONLY — not punctuation. So
 *  "SHAKEYS" and "SHAKEY'S" remain distinct customers. That is a known
 *  limitation, not an oversight: collapsing punctuation would also merge
 *  genuinely different accounts, and the call belongs to the operator. */
export function customerKey(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}
