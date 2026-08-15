import { redirect } from "next/navigation";
import { DEFAULT_BRANCH_ID } from "../../../lib/constants";

// /inventory moved to /[branch]/inventory.
export default function InventoryRedirectPage() {
  redirect(`/${DEFAULT_BRANCH_ID}/inventory`);
}
