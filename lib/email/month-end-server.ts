import "server-only";

import type { MonthEndInvoiceSnapshot } from "@/lib/email/types";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type WorkspaceRow = {
  id: string;
  name: string;
  owner_id: string;
};

type WorkspaceSettingsRow = {
  workspace_id: string;
  finance_email: string | null;
  time_zone: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  type: string;
  party_name: string;
  invoice_date: string;
  due_date: string;
  amount: number | string;
  amount_paid: number | string | null;
  balance_remaining: number | string | null;
  currency: string;
  status: string;
};

export type WorkspaceMonthEndTarget = {
  workspaceId: string;
  workspaceName: string;
  businessEmail: string;
  timeZone: string;
};

export type MonthEndRunType = "manual_preview" | "manual_send" | "auto_check" | "auto_send";
export type MonthEndRunStatus = "success" | "skipped" | "failed";

export type MonthEndJobRunRow = {
  id: string;
  workspace_id: string;
  run_type: MonthEndRunType;
  status: MonthEndRunStatus;
  reason: string | null;
  recipient_email: string | null;
  snapshot_month: string | null;
  snapshot_date: string | null;
  time_zone: string | null;
  provider_message_id: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

export async function getWorkspaceMembership(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    workspaceId: data.workspace_id as string,
    role: data.role as string
  };
}

export async function getWorkspaceOwner(admin: AdminClient, workspaceId: string) {
  const { data: workspaceRow, error: workspaceError } = await admin
    .from("workspaces")
    .select("id, owner_id, name")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw new Error(workspaceError.message);
  }

  if (!workspaceRow) {
    return null;
  }

  const workspace = workspaceRow as WorkspaceRow;
  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", workspace.owner_id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profile = (profileRow ?? null) as ProfileRow | null;

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    ownerId: workspace.owner_id,
    ownerEmail: profile?.email?.trim().toLowerCase() ?? "",
    ownerFullName: profile?.full_name?.trim() ?? ""
  };
}

export async function getWorkspaceMonthEndTarget(admin: AdminClient, workspaceId: string) {
  const { data: workspaceRow, error: workspaceError } = await admin
    .from("workspaces")
    .select("id, owner_id, name")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw new Error(workspaceError.message);
  }

  if (!workspaceRow) {
    return null;
  }

  const { data: settingsRow, error: settingsError } = await admin
    .from("workspace_settings")
    .select("workspace_id, finance_email, time_zone")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  return {
    workspaceId: (workspaceRow as WorkspaceRow).id,
    workspaceName: (workspaceRow as WorkspaceRow).name,
    businessEmail: ((settingsRow as WorkspaceSettingsRow | null)?.finance_email ?? "").trim().toLowerCase(),
    timeZone: ((settingsRow as WorkspaceSettingsRow | null)?.time_zone ?? "").trim() || "America/Port_of_Spain"
  };
}

export async function listMonthEndTargets(admin: AdminClient): Promise<WorkspaceMonthEndTarget[]> {
  const { data: workspaceRows, error: workspaceError } = await admin
    .from("workspaces")
    .select("id, name, owner_id")
    .order("created_at", { ascending: true });

  if (workspaceError) {
    throw new Error(workspaceError.message);
  }

  const workspaces = (workspaceRows ?? []) as WorkspaceRow[];

  if (!workspaces.length) {
    return [];
  }

  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const { data: settingsRows, error: settingsError } = await admin
    .from("workspace_settings")
    .select("workspace_id, finance_email, time_zone")
    .in("workspace_id", workspaceIds);

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const settingsByWorkspaceId = new Map(
    ((settingsRows ?? []) as WorkspaceSettingsRow[]).map((row) => [row.workspace_id, row])
  );

  return workspaces.map((workspace) => {
    const workspaceSettings = settingsByWorkspaceId.get(workspace.id);

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      businessEmail: workspaceSettings?.finance_email?.trim().toLowerCase() ?? "",
      timeZone: workspaceSettings?.time_zone?.trim() || "America/Port_of_Spain"
    };
  });
}

export async function loadWorkspaceMonthEndInvoices(
  admin: AdminClient,
  workspaceId: string
): Promise<MonthEndInvoiceSnapshot[]> {
  const { data, error } = await admin
    .from("invoices")
    .select(
      "id, invoice_number, type, party_name, invoice_date, due_date, amount, amount_paid, balance_remaining, currency, status"
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as InvoiceRow[]).map((row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    type: row.type === "payable" ? "payable" : "receivable",
    partyName: row.party_name,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    amount: toNumber(row.amount),
    amountPaid: toNumber(row.amount_paid),
    balanceRemaining: toNumber(row.balance_remaining),
    currency: normalizeCurrency(row.currency),
    status: normalizeStatus(row.status)
  }));
}

export async function recordEmailSendLog(
  admin: AdminClient,
  {
    workspaceId,
    subject,
    recipients,
    status,
    providerMessageId,
    errorMessage,
    summarySnapshot,
    createdBy
  }: {
    workspaceId: string;
    subject: string;
    recipients: string[];
    status: "sent" | "failed";
    providerMessageId?: string;
    errorMessage?: string;
    summarySnapshot?: Record<string, unknown>;
    createdBy?: string | null;
  }
) {
  const { error } = await admin.from("email_send_logs").insert({
    workspace_id: workspaceId,
    subject,
    recipients,
    provider: "mailersend",
    provider_message_id: providerMessageId ?? null,
    status,
    error_message: errorMessage ?? null,
    summary_snapshot: summarySnapshot ?? null,
    created_by: createdBy ?? null
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function recordMonthEndJobRun(
  admin: AdminClient,
  {
    workspaceId,
    runType,
    status,
    reason,
    recipientEmail,
    snapshotMonth,
    snapshotDate,
    timeZone,
    providerMessageId,
    metadata,
    createdBy
  }: {
    workspaceId: string;
    runType: MonthEndRunType;
    status: MonthEndRunStatus;
    reason?: string | null;
    recipientEmail?: string | null;
    snapshotMonth?: string | null;
    snapshotDate?: string | null;
    timeZone?: string | null;
    providerMessageId?: string | null;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }
) {
  const { error } = await admin.from("month_end_job_runs").insert({
    workspace_id: workspaceId,
    run_type: runType,
    status,
    reason: reason ?? null,
    recipient_email: recipientEmail ?? null,
    snapshot_month: snapshotMonth ?? null,
    snapshot_date: snapshotDate ?? null,
    time_zone: timeZone ?? null,
    provider_message_id: providerMessageId ?? null,
    metadata: metadata ?? {},
    created_by: createdBy ?? null
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function listMonthEndJobRuns(admin: AdminClient, workspaceId: string, limit = 20) {
  const { data, error } = await admin
    .from("month_end_job_runs")
    .select(
      "id, workspace_id, run_type, status, reason, recipient_email, snapshot_month, snapshot_date, time_zone, provider_message_id, metadata, created_by, created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as MonthEndJobRunRow[];
}

export async function hasAutomatedMonthEndSendForPeriod(
  admin: AdminClient,
  workspaceId: string,
  periodMonth: string
) {
  const { count, error } = await admin
    .from("email_send_logs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "sent")
    .contains("summary_snapshot", {
      kind: "month_end_auto",
      periodMonth
    });

  if (error) {
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

export function getTimeZoneDateString(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export function isLastDayOfMonthInTimeZone(value: Date, timeZone: string) {
  const today = getTimeZoneDateString(value, timeZone);
  const tomorrow = getTimeZoneDateString(new Date(value.getTime() + 24 * 60 * 60 * 1000), timeZone);

  return today.slice(0, 7) !== tomorrow.slice(0, 7);
}

export function getCurrentOrNextMonthEndDateString(value: Date, timeZone: string) {
  const today = getTimeZoneDateString(value, timeZone);
  const [yearText, monthText, dayText] = today.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const lastDayOfMonth = new Date(year, month, 0).getDate();

  if (day <= lastDayOfMonth) {
    return `${yearText}-${monthText}-${String(lastDayOfMonth).padStart(2, "0")}`;
  }

  const nextMonthDate = new Date(year, month, 1);
  const nextYear = String(nextMonthDate.getFullYear());
  const nextMonth = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
  const nextLastDay = String(new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0).getDate()).padStart(
    2,
    "0"
  );

  return `${nextYear}-${nextMonth}-${nextLastDay}`;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }

  return 0;
}

function normalizeCurrency(value: string): MonthEndInvoiceSnapshot["currency"] {
  if (value === "USD" || value === "EUR" || value === "GBP" || value === "CAD" || value === "BOB") {
    return value;
  }

  return "TTD";
}

function normalizeStatus(value: string): MonthEndInvoiceSnapshot["status"] {
  if (
    value === "Draft" ||
    value === "Pending" ||
    value === "Due Soon" ||
    value === "Overdue" ||
    value === "Paid" ||
    value === "Partially Paid" ||
    value === "Cancelled"
  ) {
    return value;
  }

  return "Pending";
}
