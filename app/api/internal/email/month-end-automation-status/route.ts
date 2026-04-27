import { NextResponse } from "next/server";

import {
  getCurrentOrNextMonthEndDateString,
  getTimeZoneDateString,
  getWorkspaceMembership,
  getWorkspaceMonthEndTarget,
  listMonthEndJobRuns,
  type MonthEndJobRunRow
} from "@/lib/email/month-end-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const context = await requireWorkspaceAdminForAutomationStatus();
    const target = await getWorkspaceMonthEndTarget(context.admin, context.workspaceId);

    if (!target) {
      return NextResponse.json({ ok: false, error: "Workspace month-end settings could not be loaded." }, { status: 404 });
    }

    const recentRuns = await listMonthEndJobRuns(context.admin, context.workspaceId, 24);
    const lastCheck = recentRuns.find((run) => run.run_type === "auto_check") ?? null;
    const lastSuccessfulAutoSend =
      recentRuns.find((run) => run.run_type === "auto_send" && run.status === "success") ?? null;
    const lastSuccessfulManualSend =
      recentRuns.find((run) => run.run_type === "manual_send" && run.status === "success") ?? null;
    const now = new Date();
    const todayLocalDate = getTimeZoneDateString(now, target.timeZone);
    const nextMonthEndDate = getCurrentOrNextMonthEndDateString(now, target.timeZone);

    return NextResponse.json({
      ok: true,
      enabled: Boolean(process.env.CRON_SECRET),
      scheduleUtc: "0 5 * * *",
      workspaceId: target.workspaceId,
      workspaceName: target.workspaceName,
      businessEmail: target.businessEmail,
      timeZone: target.timeZone,
      todayLocalDate,
      nextMonthEndDate,
      lastCheck: serializeRun(lastCheck),
      lastSuccessfulAutoSend: serializeRun(lastSuccessfulAutoSend),
      lastSuccessfulManualSend: serializeRun(lastSuccessfulManualSend),
      recentRuns: recentRuns.map(serializeRun)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Month-end automation status could not be loaded.";
    const status = error instanceof ApiError ? error.status : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

function serializeRun(run: MonthEndJobRunRow | null) {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    runType: run.run_type,
    status: run.status,
    reason: run.reason,
    recipientEmail: run.recipient_email,
    snapshotMonth: run.snapshot_month,
    snapshotDate: run.snapshot_date,
    timeZone: run.time_zone,
    providerMessageId: run.provider_message_id,
    metadata: run.metadata ?? {},
    createdAt: run.created_at
  };
}

async function requireWorkspaceAdminForAutomationStatus() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ApiError("Sign in before viewing month-end automation status.", 401);
  }

  const admin = createAdminClient();
  const membership = await getWorkspaceMembership(admin, user.id);

  if (!membership) {
    throw new ApiError("This account is not assigned to a workspace.", 403);
  }

  if (!["owner", "admin"].includes(membership.role)) {
    throw new ApiError("Only workspace owners and admins can view month-end automation status.", 403);
  }

  return {
    admin,
    workspaceId: membership.workspaceId
  };
}

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
