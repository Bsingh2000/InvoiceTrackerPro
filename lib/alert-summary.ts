import { getAppTodayString } from "@/lib/date-utils";
import { daysUntil, invoiceBalance, isInvoiceOpen } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export const ALERT_WORKFLOW_KEY = "invoice-tracker:alert-workflow";

type ShellAlertKind = "overdue" | "due-today" | "due-tomorrow" | "due-soon" | "large-value";
type AlertWorkflowState = "active" | "snoozed" | "resolved" | "dismissed" | "reviewed" | "archived";
type AlertStateMap = Record<string, { state: AlertWorkflowState; updatedAt?: string; snoozeUntil?: string }>;

const largeValueThreshold = 20000;
const dueSoonWindow = 7;

export function getShellAlertSummary(invoices: Invoice[]) {
  const states = readAlertStates();
  const openInvoices = invoices.filter(isInvoiceOpen);
  let active = 0;
  let overdue = 0;
  let dueToday = 0;

  openInvoices.forEach((invoice) => {
    const kind = getShellAlertKind(invoice);

    if (!kind) {
      return;
    }

    const id = `${kind}-${invoice.id}`;
    const stored = states[id];
    const activeAfterSnooze =
      stored?.state === "snoozed" &&
      stored.snoozeUntil &&
      stored.snoozeUntil <= getAppTodayString();
    const workflow = activeAfterSnooze ? "active" : stored?.state ?? "active";

    if (["dismissed", "resolved", "snoozed", "archived"].includes(workflow)) {
      return;
    }

    active += 1;

    if (kind === "overdue") {
      overdue += 1;
    }

    if (kind === "due-today") {
      dueToday += 1;
    }
  });

  return { active, overdue, dueToday };
}

function getShellAlertKind(invoice: Invoice): ShellAlertKind | null {
  const days = daysUntil(invoice.dueDate);
  const balance = invoiceBalance(invoice);

  if (days < 0) {
    return "overdue";
  }

  if (days === 0) {
    return "due-today";
  }

  if (days === 1) {
    return "due-tomorrow";
  }

  if (days <= dueSoonWindow) {
    return "due-soon";
  }

  if (balance >= largeValueThreshold && days <= 14) {
    return "large-value";
  }

  return null;
}

function readAlertStates(): AlertStateMap {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = window.localStorage.getItem(ALERT_WORKFLOW_KEY);

  if (!stored) {
    return {};
  }

  try {
    return JSON.parse(stored) as AlertStateMap;
  } catch {
    return {};
  }
}
