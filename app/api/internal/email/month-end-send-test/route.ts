import { NextRequest, NextResponse } from "next/server";

import { buildMonthEndSummary } from "@/lib/email/build-month-end-summary";
import {
  getWorkspaceMembership,
  getWorkspaceMonthEndTarget,
  recordEmailSendLog,
  recordMonthEndJobRun
} from "@/lib/email/month-end-server";
import { renderMonthEndSummary } from "@/lib/email/render-month-end-summary";
import { sendMailerSendEmail } from "@/lib/email/send-mailersend";
import { monthEndSendTestRequestSchema } from "@/lib/email/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    if (!isInternalRequest(request)) {
      return NextResponse.json({ ok: false, error: "Internal email tools must be called from this app." }, { status: 403 });
    }

    const body = await readJsonBody(request);

    if (!body.ok) {
      return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
    }

    const parsed = monthEndSendTestRequestSchema.safeParse(body.data);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid email send request.", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const adminContext = await requireWorkspaceAdminForMonthEndEmail();
    const summary = buildMonthEndSummary(parsed.data);
    const email = renderMonthEndSummary(summary);
    const recipients = [adminContext.businessEmail];
    const sendResult = await sendMailerSendEmail({
      to: recipients,
      subject: email.subject,
      html: email.html,
      text: email.text
    });

    if (!sendResult.ok) {
      await safeRecordManualSendRun(adminContext.admin, {
        workspaceId: adminContext.workspaceId,
        createdBy: adminContext.userId,
        recipientEmail: adminContext.businessEmail,
        snapshotMonth: summary.snapshotDate.slice(0, 7),
        snapshotDate: summary.snapshotDate,
        status: "failed",
        reason: sendResult.error,
        metadata: {
          monthLabel: summary.monthLabel,
          receivablesOpenCount: summary.sections.receivables.openCount,
          payablesOpenCount: summary.sections.payables.openCount
        }
      });

      await recordEmailSendFailure(adminContext.admin, {
        workspaceId: adminContext.workspaceId,
        recipients,
        subject: email.subject,
        summary,
        createdBy: adminContext.userId,
        errorMessage: sendResult.error
      });

      return NextResponse.json(
        {
          ok: false,
          error: sendResult.error,
          status: sendResult.status,
          details: sendResult.details,
          mailerSendError: sendResult.mailerSendError
        },
        { status: 502 }
      );
    }

    try {
      await recordEmailSendLog(adminContext.admin, {
        workspaceId: adminContext.workspaceId,
        recipients,
        subject: email.subject,
        status: "sent",
        providerMessageId: sendResult.messageId,
        createdBy: adminContext.userId,
        summarySnapshot: {
          kind: "month_end_manual",
          monthLabel: summary.monthLabel,
          snapshotDate: summary.snapshotDate,
          sections: {
            receivablesOpenCount: summary.sections.receivables.openCount,
            payablesOpenCount: summary.sections.payables.openCount
          }
        }
      });
    } catch (error) {
      console.error("[MonthEndEmail] Could not record successful send log", error);
    }

    await safeRecordManualSendRun(adminContext.admin, {
      workspaceId: adminContext.workspaceId,
      createdBy: adminContext.userId,
      recipientEmail: adminContext.businessEmail,
      snapshotMonth: summary.snapshotDate.slice(0, 7),
      snapshotDate: summary.snapshotDate,
      status: "success",
      providerMessageId: sendResult.messageId ?? null,
      metadata: {
        monthLabel: summary.monthLabel,
        receivablesOpenCount: summary.sections.receivables.openCount,
        payablesOpenCount: summary.sections.payables.openCount
      }
    });

    return NextResponse.json({ ok: true, summary, email, messageId: sendResult.messageId, recipients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Month-end email send failed.";
    const status = error instanceof ApiError ? error.status : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return {
      ok: true as const,
      data: await request.json()
    };
  } catch {
    return {
      ok: false as const,
      error: "Request body must be valid JSON."
    };
  }
}

function isInternalRequest(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  return new URL(origin).host === request.nextUrl.host;
}

async function requireWorkspaceAdminForMonthEndEmail() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ApiError("Sign in before sending month-end summary emails.", 401);
  }

  const admin = createAdminClient();
  const membership = await getWorkspaceMembership(admin, user.id);

  if (!membership) {
    throw new ApiError("This account is not assigned to a workspace.", 403);
  }

  if (!["owner", "admin"].includes(membership.role)) {
    throw new ApiError("Only workspace owners and admins can send month-end summary emails.", 403);
  }

  const target = await getWorkspaceMonthEndTarget(admin, membership.workspaceId);

  if (!target?.businessEmail) {
    throw new ApiError("The workspace business email is not configured yet.", 409);
  }

  return {
    admin,
    workspaceId: membership.workspaceId,
    businessEmail: target.businessEmail,
    userId: user.id
  };
}

async function recordEmailSendFailure(
  admin: ReturnType<typeof createAdminClient>,
  {
    workspaceId,
    recipients,
    subject,
    summary,
    createdBy,
    errorMessage
  }: {
    workspaceId: string;
    recipients: string[];
    subject: string;
    summary: ReturnType<typeof buildMonthEndSummary>;
    createdBy: string;
    errorMessage: string;
  }
) {
  try {
    await recordEmailSendLog(admin, {
      workspaceId,
      recipients,
      subject,
      status: "failed",
      createdBy,
      errorMessage,
      summarySnapshot: {
        kind: "month_end_manual",
        monthLabel: summary.monthLabel,
        snapshotDate: summary.snapshotDate
      }
    });
  } catch (error) {
    console.error("[MonthEndEmail] Could not record failed send log", error);
  }
}

async function safeRecordManualSendRun(
  admin: ReturnType<typeof createAdminClient>,
  {
    workspaceId,
    createdBy,
    recipientEmail,
    snapshotMonth,
    snapshotDate,
    status,
    reason,
    providerMessageId,
    metadata
  }: {
    workspaceId: string;
    createdBy: string;
    recipientEmail: string;
    snapshotMonth: string;
    snapshotDate: string;
    status: "success" | "failed";
    reason?: string;
    providerMessageId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await recordMonthEndJobRun(admin, {
      workspaceId,
      runType: "manual_send",
      status,
      reason,
      recipientEmail,
      snapshotMonth,
      snapshotDate,
      providerMessageId,
      metadata,
      createdBy
    });
  } catch (error) {
    console.error("[MonthEndEmail] Could not record manual send run", error);
  }
}

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
