import { redirect } from "next/navigation";
import { DEFAULT_BRANCH_ID } from "../../../lib/constants";

// /sales moved to /[branch]/sales.
export default function SalesRedirectPage() {
  redirect(`/${DEFAULT_BRANCH_ID}/sales`);
}
