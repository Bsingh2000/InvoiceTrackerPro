import { format } from "date-fns";

import {
  daysBetweenDateOnly,
  getAppTodayString,
  isSameMonthDateOnly,
  parseAppDate
} from "@/lib/date-utils";
import type { CurrencyCode, Invoice, InvoiceStatus } from "@/lib/types";

export const currencies: CurrencyCode[] = ["TTD", "USD", "EUR", "GBP", "CAD", "BOB"];

export function formatCurrency(amount: number, currency: CurrencyCode = "TTD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "BOB" ? 0 : 2
  }).format(amount);
}

export function formatCompactCurrency(amount: number, currency: CurrencyCode = "TTD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(amount);
}

export function formatDate(date: string) {
  return format(parseAppDate(date), "MMM d, yyyy");
}

export function formatDateTime(date: string) {
  return format(parseAppDate(date), "MMM d, yyyy, h:mm a");
}

export function formatShortDate(date: string) {
  return format(parseAppDate(date), "MMM d");
}

export function daysUntil(dueDate: string) {
  return daysBetweenDateOnly(dueDate);
}

export function describeDueDate(dueDate: string, status?: InvoiceStatus) {
  if (status === "Paid" || status === "Cancelled") {
    return status;
  }

  if (dueDate === getAppTodayString()) {
    return "Due today";
  }

  if (daysUntil(dueDate) === 1) {
    return "Due tomorrow";
  }

  const days = daysUntil(dueDate);

  if (days < 0) {
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  }

  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

export function invoiceBalance(invoice: Invoice) {
  return Math.max(0, invoice.balanceRemaining);
}

export function isInvoiceOpen(invoice: Invoice) {
  return !["Paid", "Cancelled"].includes(invoice.status);
}

export function isInvoiceOverdue(invoice: Invoice) {
  return isInvoiceOpen(invoice) && daysUntil(invoice.dueDate) < 0;
}

export function isDueThisMonth(invoice: Invoice) {
  return isSameMonthDateOnly(invoice.dueDate, getAppTodayString());
}

export function percentage(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}
