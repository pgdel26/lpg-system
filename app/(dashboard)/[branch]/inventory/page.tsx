import { redirect } from "next/navigation";

// Inventory is a tab on the outlet page now, not a route of its own. Kept as a
// redirect so existing links and bookmarks still land somewhere useful.
export default async function InventoryRedirectPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  redirect(`/${branch}`);
}
