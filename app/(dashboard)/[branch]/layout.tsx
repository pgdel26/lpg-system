"use client";
import { useParams } from "next/navigation";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import styles from "./layout.module.css";

export default function BranchLayout({ children }: { children: React.ReactNode }) {
  const { branch: branchId } = useParams<{ branch: string }>();
  const data = useAppData();

  // Branches haven't loaded yet — avoid a false "not found" flash while the
  // first snapshot is still in flight.
  if (data.branches.length === 0) return null;

  const branch = data.branches.find((b) => b.id === branchId);
  if (!branch) {
    return <div className={styles.notFound}>Unknown outlet &ldquo;{branchId}&rdquo;.</div>;
  }

  return <>{children}</>;
}
