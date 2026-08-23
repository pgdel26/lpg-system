// ============================================================
// ALLOWED USERS
// Who can sign in, and at what role. Addresses are
// case-insensitive.
//
// Roles live HERE, in code, deliberately — not in Firestore.
// An admin is the only account that can edit restrictions, so
// if admin status were editable from the UI a single wrong
// click could leave the app with no admin and no way back in.
// Per-tab restrictions for non-admins ARE stored in Firestore
// (see lib/hooks/usePermissionsData.ts) because those are safe
// to get wrong: an admin can always undo them.
// ============================================================

export type AppRole = "admin" | "staff";

export interface AllowedUser {
  email: string;
  role: AppRole;
}

export const ALLOWED_USERS: AllowedUser[] = [
  { email: "patgdeleon@gmail.com", role: "admin" },
  { email: "ma.gloriadeleon@yahoo.com", role: "admin" },
  { email: "gegasulpili@gmail.com", role: "staff" },
];


const normalize = (email: string | null | undefined): string | null =>
  email ? email.trim().toLowerCase() : null;

export function isEmailAllowed(email: string | null | undefined): boolean {
  const e = normalize(email);
  if (!e) return false;
  return ALLOWED_USERS.some((u) => u.email.toLowerCase() === e);
}

/** The user's role, or null when the address isn't allowed at all. */
function roleForEmail(email: string | null | undefined): AppRole | null {
  const e = normalize(email);
  if (!e) return null;
  return ALLOWED_USERS.find((u) => u.email.toLowerCase() === e)?.role ?? null;
}

/** Admins bypass every restriction and are the only ones who can edit them. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return roleForEmail(email) === "admin";
}

/** Non-admin accounts — the ones the Restrictions screen configures. */
export function staffUsers(): AllowedUser[] {
  return ALLOWED_USERS.filter((u) => u.role !== "admin");
}
