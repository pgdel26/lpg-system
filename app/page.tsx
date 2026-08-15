import { redirect } from "next/navigation";
import { DEFAULT_BRANCH_ID } from "../lib/constants";

export default function Home() {
  redirect(`/${DEFAULT_BRANCH_ID}/sales`);
}
