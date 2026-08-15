import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import type { Branch } from "../types";

export interface UseBranchesData {
  branches: Branch[];
}

// Read-only in V1 — no branch-management CRUD UI. Branches are seeded/added via
// scripts/seed-branches.mjs, not through the app.
export function useBranchesData(): UseBranchesData {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "branches"), orderBy("sortOrder", "asc")),
      (snapshot) => {
        const list: Branch[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Branch));
        setBranches(list);
      },
    );
    return () => unsub();
  }, []);

  return { branches };
}
