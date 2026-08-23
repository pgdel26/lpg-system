import { redirect } from "next/navigation";
import { DEFAULT_BRANCH_ID } from "../../../lib/constants";

// Legacy URL: Inventory is now a tab on the outlet page. Kept so old
// bookmarks and links land somewhere useful instead of a 404.
export default function InventoryRedirectPage() {
  redirect(`/${DEFAULT_BRANCH_ID}`);
}
