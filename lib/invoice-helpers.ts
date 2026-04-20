import {
  daysUntil,
  describeDueDate,
  formatCurrency,
  formatDate,
  invoiceBalance,
  isInvoiceOpen
} from "@/lib/format";
import type { Invoice, InvoiceStatus } from "@/lib/types";

export function getOperationalStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "Paid" || (invoice.balanceRemaining <= 0 && invoice.amountPaid >= invoice.amount)) {
    return "Paid";
  }

  if (invoice.status === "Cancelled" || invoice.status === "Draft" || invoice.status === "Partially Paid") {
    return invoice.status;
  }

  const days = daysUntil(invoice.dueDate);

  if (days < 0) {
    return "Overdue";
  }

  if (days <= 7) {
    return "Due Soon";
  }

  if (invoice.status === "Overdue" || invoice.status === "Due Soon") {
    return "Pending";
  }

  return invoice.status;
}

export function getAgingLabel(invoice: Invoice) {
  const status = getOperationalStatus(invoice);

  if (status === "Paid") {
    return `Paid ${formatDate(invoice.updatedAt)}`;
  }

  if (status === "Cancelled") {
    return "Cancelled";
  }

  return describeDueDate(invoice.dueDate, status);
}

export function getPartyLabel(invoice: Invoice) {
  return invoice.type === "receivable" ? "Customer" : "Vendor";
}

export function getTypeLabel(invoice: Invoice) {
  return invoice.type === "receivable" ? "Collect" : "Pay";
}

export function getBalanceLine(invoice: Invoice) {
  return invoiceBalance(invoice) <= 0
    ? `Paid in full | ${invoice.currency}`
    : `Balance: ${formatCurrency(invoiceBalance(invoice), invoice.currency)} | ${invoice.currency}`;
}

export function canReceivePayment(invoice: Invoice) {
  return isInvoiceOpen(invoice) && invoiceBalance(invoice) > 0;
}
