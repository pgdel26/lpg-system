import { useMemo, useState } from "react";
import { navPermissions } from "../../lib/navigation";
import { staffUsers } from "../../lib/allowedEmails";
import type { Branch } from "../../lib/types";
import styles from "./RestrictionsTab.module.css";

interface RestrictionsTabProps {
  branches: Branch[];
  /** email (lower-cased) -> denied permission keys, straight from Firestore. */
  deniedByEmail: Record<string, string[]>;
  onSave: (email: string, deniedKeys: string[]) => Promise<void>;
}

export default function RestrictionsTab({
  branches, deniedByEmail, onSave,
}: RestrictionsTabProps) {
  const users = staffUsers();
  const [selectedEmail, setSelectedEmail] = useState(users[0]?.email || "");
  const [saving, setSaving] = useState(false);

  const permissions = useMemo(() => navPermissions(branches), [branches]);
  const groups = useMemo(() => {
    const out: Array<{ group: string; items: typeof permissions }> = [];
    for (const p of permissions) {
      const last = out[out.length - 1];
      if (last && last.group === p.group) last.items.push(p);
      else out.push({ group: p.group, items: [p] });
    }
    return out;
  }, [permissions]);

  const key = selectedEmail.trim().toLowerCase();
  const denied = deniedByEmail[key] || [];
  // The checkbox reads as ALLOWED because that's how people think about access,
  // while storage is a deny list so a newly added tab defaults to visible.
  const isAllowed = (permKey: string) => !denied.includes(permKey);

  const toggle = async (permKey: string) => {
    const next = isAllowed(permKey)
      ? [...denied, permKey]
      : denied.filter((k) => k !== permKey);
    setSaving(true);
    await onSave(selectedEmail, next);
    setSaving(false);
  };

  const setAll = async (allow: boolean) => {
    setSaving(true);
    await onSave(selectedEmail, allow ? [] : permissions.map((p) => p.key));
    setSaving(false);
  };

  if (users.length === 0) {
    return (
      <div className={styles.empty}>
        No staff accounts to configure. Accounts and their roles live in{" "}
        <code className={styles.code}>lib/allowedEmails.ts</code> and need a deploy to change.
      </div>
    );
  }

  return (
    <div className="animate-fade">
      {/* Stated plainly and permanently, because the screen implies more than it
          delivers: this hides navigation, it does not secure data. */}
      <div className={styles.notice}>
        <strong>These settings control what the app shows, not what it protects.</strong>{" "}
        A restricted user can still reach data directly until Firestore security
        rules are in place. Treat this as tidying the menu, not as a permission
        boundary.
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel} htmlFor="rt-user">Staff account</label>
          <select
            id="rt-user"
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
            className={styles.select}
          >
            {users.map((u) => <option key={u.email} value={u.email}>{u.email}</option>)}
          </select>
        </div>

        <div className={styles.bulkActions}>
          <button type="button" onClick={() => setAll(true)} disabled={saving} className={styles.bulkButton}>
            Allow all
          </button>
          <button type="button" onClick={() => setAll(false)} disabled={saving} className={styles.bulkButton}>
            Restrict all
          </button>
        </div>

        <span className={styles.savedHint}>
          {saving ? "Saving…" : `${permissions.length - denied.length} of ${permissions.length} tabs allowed`}
        </span>
      </div>

      {/* Admins are absent from the account list on purpose — an admin bypasses
          restrictions and is the only role that can edit them, so allowing one
          to be restricted would permit a lockout with no way back. */}
      <div className={styles.grid}>
        {groups.map(({ group, items }) => (
          <div key={group} className={styles.groupCard}>
            <div className={styles.groupHeader}>{group}</div>
            {items.map((p) => (
              <label key={p.key} className={styles.row}>
                <input
                  type="checkbox"
                  checked={isAllowed(p.key)}
                  onChange={() => toggle(p.key)}
                  disabled={saving}
                  className={styles.checkbox}
                />
                <span className={styles.rowLabel}>{p.label}</span>
                <span className={styles.rowState}>
                  {isAllowed(p.key) ? "Allowed" : "Hidden"}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.footnote}>
        Changes save immediately and apply on the staff user&apos;s next render — no
        sign-out needed. Tabs added to the app in future default to allowed.
      </div>
    </div>
  );
}
