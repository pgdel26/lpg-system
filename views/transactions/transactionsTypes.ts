import type { DailyReport, SaleTransaction, Swap, Refund, Expense, Staff } from "../../lib/types";

// dailyReport carries an actualCashRemit field that the Sales Report tab reads
// and writes back through onUpdateDailyStaff. The base DailyReport type does not
// declare it (it is an optional persisted extra), so we widen it locally.
export type DailyReportWithCash = DailyReport & {
  actualCashRemit?: number | string | null;
};

// In-progress inline edit row. The `type` discriminates which table the row
// belongs to; fields are a superset matching startEdit in the parent.
export type EditData =
  | {
      type: "sale";
      id: string;
      invoice: string;
      customerName: string;
      discount: number | string;
      totalAmount: number;
      paymentType: string;
      srp: number;
      quantity: number;
    }
  | {
      type: "swap";
      id: string;
      productFrom: string;
      productTo: string;
      price: number | string;
    }
  | {
      type: "refund";
      id: string;
      invoice: string;
      customerName: string;
      reason: string;
      totalRefund: number;
      items: Array<Record<string, unknown>>;
    }
  | {
      type: "expense";
      id: string;
      description: string;
      amount: number | string;
    };

export type PendingDelete = {
  type: "sale" | "swap" | "refund" | "expense";
  id: string;
};

// Handler signatures mirror the AppData hooks passed through the route page,
// so the route can pass data.updateSale etc. directly without casts.
export type UpdateSaleFn = (
  id: string,
  data: {
    invoice?: string;
    customerName?: string;
    discount?: number | string;
    totalAmount?: number | string;
    paymentType?: string;
  },
) => Promise<void>;

export type UpdateSwapFn = (
  id: string,
  data: { productFrom: string; productTo: string; price: string | number },
) => Promise<void>;

export interface RefundItemInput {
  section: string;
  product: string;
  qty: string | number;
  value: string | number;
  defective: boolean;
  defectStatus: string;
}

export type UpdateRefundFn = (
  id: string,
  data: {
    invoice: string;
    customerName: string;
    reason: string;
    totalRefund: number;
    items: RefundItemInput[];
  },
) => Promise<void>;

export type UpdateExpenseFn = (
  id: string,
  data: { description: string; amount: string | number },
) => Promise<void>;

export type {
  SaleTransaction,
  Swap,
  Refund,
  Expense,
  Staff,
};
