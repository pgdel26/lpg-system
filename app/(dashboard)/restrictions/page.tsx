"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import RestrictionsTab from "../../../views/staff/RestrictionsTab";

export default function RestrictionsRoutePage() {
  const data = useAppData();

  // Admin-only, enforced twice on purpose: the sidebar doesn't render the link
  // for a non-admin, and the layout's guard bounces a typed URL. This third
  // check is the one that holds if either of those is ever changed carelessly.
  if (!data.isAdmin) {
    return null;
  }

  return (
    <RestrictionsTab
      branches={data.branches}
      deniedByEmail={data.deniedByEmail}
      onSave={data.setDeniedForEmail}
    />
  );
}
