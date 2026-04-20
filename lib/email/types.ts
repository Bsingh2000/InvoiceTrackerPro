import { z } from "zod";

import type { CurrencyCode, InvoiceStatus, InvoiceType } from "@/lib/types";

export const primarySummaryCurrencies: CurrencyCode[] = ["TTD", "USD"];

export const monthEndInvoiceSnapshotSchema = z.object({
  id: z.string().min(1),
  invoiceNumber: z.string().min(1),
  type: z.enum(["receivable", "payable"]),
  partyName: z.string().min(1),
  invoiceDate: z.string().optional().default(""),
  dueDate: z.string().optional().default(""),
  amount: z.coerce.number().nonnegative(),
  currency: z.enum(["TTD", "USD", "EUR", "GBP", "CAD", "BOB"]),
  status: z.enum([
    "Draft",
    "Pending",
    "Due Soon",
    "Overdue",
    "Paid",
    "Partially Paid",
    "Cancelled"
  ]),
  amountPaid: z.coerce.number().nonnegative().default(0),
  balanceRemaining: z.coerce.number().nonnegative()
});

export const monthEndPreviewRequestSchema = z.object({
  invoices: z.array(monthEndInvoiceSnapshotSchema),
  snapshotDate: z.string().optional()
});

export const monthEndSendTestRequestSchema = monthEndPreviewRequestSchema.extend({
  recipients: z.array(z.string().email()).min(1).max(10)
});

export type MonthEndInvoiceSnapshot = z.infer<typeof monthEndInvoiceSnapshotSchema>;
export type MonthEndPreviewRequest = z.infer<typeof monthEndPreviewRequestSchema>;
export type MonthEndSendTestRequest = z.infer<typeof monthEndSendTestRequestSchema>;

export type SummaryCurrencyTotals = Record<CurrencyCode, number>;

export type MonthEndSummaryInvoice = {
  id: string;
  partyName: string;
  invoiceNumber: string;
  type: InvoiceType;
  typeLabel: "Collect" | "Pay";
  invoiceDate: string;
  invoiceDateLabel: string;
  dueDate: string;
  dueDateLabel: string;
  timingLabel: string;
  daysUntilDue: number | null;
  status: InvoiceStatus;
  amount: number;
  amountPaid: number;
  balanceRemaining: number;
  currency: CurrencyCode;
};

export type MonthEndSummarySection = {
  label: string;
  totalLabel: string;
  openCount: number;
  totalsByCurrency: SummaryCurrencyTotals;
  overdue: MonthEndSummaryInvoice[];
  current: MonthEndSummaryInvoice[];
};

export type MonthEndSummary = {
  title: string;
  monthLabel: string;
  snapshotDate: string;
  snapshotDateLabel: string;
  generatedAt: string;
  sections: {
    receivables: MonthEndSummarySection;
    payables: MonthEndSummarySection;
  };
};

export type RenderedMonthEndEmail = {
  subject: string;
  html: string;
  text: string;
};
