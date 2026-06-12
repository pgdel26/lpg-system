// ============================================================
// ALLOWED EMAILS
// Add or remove Gmail addresses here to control who can
// access the app. Addresses are case-insensitive.
// ============================================================

export const ALLOWED_EMAILS: string[] = [
  "patgdeleon@gmail.com",
  "ma.gloriadeleon@yahoo.com"
];

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}
