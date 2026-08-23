import { redirect } from "next/navigation";

// The app's landing page. The dashboard spans every outlet, so it's the right
// first screen; the per-outlet pages are one click away in the sidebar.
export default function Home() {
  redirect("/dashboard");
}
