import { redirect } from "next/navigation";

// Sales is a tab on the outlet page now, not a route of its own. Kept as a
// redirect so existing links and bookmarks still land somewhere useful.
export default async function SalesRedirectPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  redirect(`/${branch}`);
}
