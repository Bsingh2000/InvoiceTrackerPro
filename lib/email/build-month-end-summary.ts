import { differenceInCalendarDays, format } from "date-fns";

import { formatEmailDate, formatMonthLabel, parseSafeDate } from "@/lib/email/format";
import {
  primarySummaryCurrencies,
  type MonthEndInvoiceSnapshot,
  type MonthEndSummary,
  type MonthEndSummaryInvoice,
  type MonthEndSummarySection,
  type SummaryCurrencyTotals
} from "@/lib/email/types";
import { currencies } from "@/lib/format";
import type { CurrencyCode } from "@/lib/types";

const closedStatuses = new Set(["Paid", "Cancelled"]);

export function buildMonthEndSummary({
  invoices,
  snapshotDate
}: {
  invoices: MonthEndInvoiceSnapshot[];
  snapshotDate?: string;
}): MonthEndSummary {
  const snapshot = parseSafeDate(snapshotDate) ?? new Date();
  const snapshotDateOnly = format(snapshot, "yyyy-MM-dd");
  const openInvoices = invoices
    .filter(isOpenInvoice)
    .map((invoice) => toSummaryInvoice(invoice, snapshot));

  return {
    title: "Month-End Invoice Summary",
    monthLabel: formatMonthLabel(snapshotDateOnly),
    snapshotDate: snapshotDateOnly,
    snapshotDateLabel: formatEmailDate(snapshotDateOnly),
    generatedAt: new Date().toISOString(),
    sections: {
      receivables: buildSection(
        "Receivables",
        "Total open receivables",
        openInvoices.filter((invoice) => invoice.type === "receivable")
      ),
      payables: buildSection(
        "Payables",
        "Total open payables",
        openInvoices.filter((invoice) => invoice.type === "payable")
      )
    }
  };
}

function isOpenInvoice(invoice: MonthEndInvoiceSnapshot) {
  const balance = getBalance(invoice);

  if (closedStatuses.has(invoice.status)) {
    return false;
  }

  return balance > 0;
}

function toSummaryInvoice(
  invoice: MonthEndInvoiceSnapshot,
  snapshotDate: Date
): MonthEndSummaryInvoice {
  const dueDate = parseSafeDate(invoice.dueDate);
  const daysUntilDue = dueDate ? differenceInCalendarDays(dueDate, snapshotDate) : null;
  const balanceRemaining = getBalance(invoice);

  return {
    id: invoice.id,
    partyName: invoice.partyName,
    invoiceNumber: invoice.invoiceNumber,
    type: invoice.type,
    typeLabel: invoice.type === "receivable" ? "Collect" : "Pay",
    invoiceDate: invoice.invoiceDate,
    invoiceDateLabel: formatEmailDate(invoice.invoiceDate),
    dueDate: invoice.dueDate,
    dueDateLabel: formatEmailDate(invoice.dueDate),
    timingLabel: getTimingLabel(daysUntilDue),
    daysUntilDue,
    status: invoice.status,
    amount: invoice.amount,
    amountPaid: invoice.amountPaid,
    balanceRemaining,
    currency: invoice.currency
  };
}

function buildSection(
  label: string,
  totalLabel: string,
  invoices: MonthEndSummaryInvoice[]
): MonthEndSummarySection {
  const overdue = invoices
    .filter((invoice) => invoice.daysUntilDue !== null && invoice.daysUntilDue < 0)
    .sort(sortOverdue);
  const current = invoices
    .filter((invoice) => invoice.daysUntilDue === null || invoice.daysUntilDue >= 0)
    .sort(sortCurrent);

  return {
    label,
    totalLabel,
    openCount: invoices.length,
    totalsByCurrency: getTotalsByCurrency(invoices),
    overdue,
    current
  };
}

function getTotalsByCurrency(invoices: MonthEndSummaryInvoice[]) {
  const totals = emptyCurrencyTotals();

  invoices.forEach((invoice) => {
    totals[invoice.currency] += invoice.balanceRemaining;
  });

  return totals;
}

function emptyCurrencyTotals(): SummaryCurrencyTotals {
  return currencies.reduce((totals, currency) => {
    totals[currency] = 0;
    return totals;
  }, {} as SummaryCurrencyTotals);
}

function sortOverdue(a: MonthEndSummaryInvoice, b: MonthEndSummaryInvoice) {
  const daysA = a.daysUntilDue ?? 0;
  const daysB = b.daysUntilDue ?? 0;

  if (daysA !== daysB) {
    return daysA - daysB;
  }

  return b.balanceRemaining - a.balanceRemaining;
}

function sortCurrent(a: MonthEndSummaryInvoice, b: MonthEndSummaryInvoice) {
  if (a.daysUntilDue === null && b.daysUntilDue !== null) {
    return 1;
  }

  if (a.daysUntilDue !== null && b.daysUntilDue === null) {
    return -1;
  }

  return (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0);
}

function getTimingLabel(daysUntilDue: number | null) {
  if (daysUntilDue === null) {
    return "Due date missing";
  }

  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return `${days} day${days === 1 ? "" : "s"} overdue`;
  }

  if (daysUntilDue === 0) {
    return "Due today";
  }

  return `${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"} remaining`;
}

function getBalance(invoice: MonthEndInvoiceSnapshot) {
  return Math.max(0, invoice.balanceRemaining ?? invoice.amount - invoice.amountPaid);
}

export function orderedSummaryCurrencies(totals: SummaryCurrencyTotals) {
  const additional = currencies.filter(
    (currency) => !primarySummaryCurrencies.includes(currency) && totals[currency] > 0
  );

  return [...primarySummaryCurrencies, ...additional] as CurrencyCode[];
}
