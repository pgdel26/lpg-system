import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

/**
 * One-shot fetch of every document in a collection whose `date` field falls in
 * an inclusive YYYY-MM-DD range.
 *
 * Extracted from three byte-identical copies (useDashboardData,
 * useIncomeStatementData, useCustomerOrdersData). Report screens deliberately
 * use getDocs rather than onSnapshot: a multi-month window doesn't need live
 * updates, and subscribing to one is a needless memory and read-cost load.
 *
 * CLIENT SDK. Unlike lib/reports/* and lib/receivables.ts, this module must NOT
 * be imported by the cron API route — that runs on the admin SDK. It belongs to
 * the hooks, which is why it takes no hook dependencies of its own.
 */
export async function fetchRangeCollection<T>(
  name: string,
  startDate: string,
  endDate: string,
): Promise<T[]> {
  const snapshot = await getDocs(
    query(collection(db, name), where("date", ">=", startDate), where("date", "<=", endDate)),
  );
  const list: T[] = [];
  snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as T));
  return list;
}
