import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// Declared locally, matching every sibling hook — there is no shared toast module.
type ToastFn = (t: { type: string; message: string }) => void;

/**
 * Per-tab restrictions for non-admin accounts, stored in Firestore so the admin
 * can change them without a deploy.
 *
 * Shape: { deniedByEmail: { "<lowercased email>": ["income-statement", ...] } }
 *
 * A DENY list, not an allow list — see lib/navigation.ts. Absent email, or an
 * absent document entirely, means no restrictions: full access. That default is
 * what makes adding a tab safe, and it's why the screen is called Restrictions.
 */
export interface UsePermissionsData {
  /** email (lower-cased) -> denied permission keys. */
  deniedByEmail: Record<string, string[]>;
  /** False until the first snapshot lands — the Sidebar waits, so a staff user
   *  never sees a restricted tab flash before the rules arrive. */
  permissionsLoaded: boolean;
  setDeniedForEmail: (email: string, deniedKeys: string[]) => Promise<void>;
}

const DOC_PATH = ["settings", "permissions"] as const;

export function usePermissionsData(onToast: ToastFn): UsePermissionsData {
  const [deniedByEmail, setDeniedByEmail] = useState<Record<string, string[]>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Live, not a one-shot read: an admin revoking a tab should take effect on the
  // staff user's next render rather than their next login.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ...DOC_PATH),
      (snap) => {
        const raw = (snap.data()?.deniedByEmail || {}) as Record<string, unknown>;
        const next: Record<string, string[]> = {};
        for (const [email, keys] of Object.entries(raw)) {
          // Defensive: this document is hand-editable in the console, so a
          // malformed entry must not break every screen's navigation.
          next[email.toLowerCase()] = Array.isArray(keys)
            ? keys.filter((k): k is string => typeof k === "string")
            : [];
        }
        setDeniedByEmail(next);
        setPermissionsLoaded(true);
      },
      (err) => {
        console.error("Permissions listener error:", err);
        // Fail OPEN, and say so. Failing closed would lock the owner out of
        // their own shop on a transient read error; an admin can always see the
        // restrictions screen to check what is configured.
        setPermissionsLoaded(true);
      },
    );
    return () => unsub();
  }, []);

  const setDeniedForEmail = useCallback(async (email: string, deniedKeys: string[]) => {
    const key = email.trim().toLowerCase();
    try {
      // merge:true and a nested path so two admins editing different users
      // can't clobber each other's entry.
      await setDoc(
        doc(db, ...DOC_PATH),
        { deniedByEmail: { [key]: deniedKeys } },
        { merge: true },
      );
    } catch (error) {
      console.error("Save restrictions error:", error);
      onToast({ type: "error", message: "Failed to save restrictions." });
    }
  }, [onToast]);

  return { deniedByEmail, permissionsLoaded, setDeniedForEmail };
}
