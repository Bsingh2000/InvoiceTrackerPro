import { NextRequest, NextResponse } from "next/server";

import { buildMonthEndSummary } from "@/lib/email/build-month-end-summary";
import {
  getTimeZoneDateString,
  hasAutomatedMonthEndSendForPeriod,
  isLastDayOfMonthInTimeZone,
  listMonthEndTargets,
  loadWorkspaceMonthEndInvoices,
  recordEmailSendLog,
  recordMonthEndJobRun
} from "@/lib/email/month-end-server";
import { renderMonthEndSummary } from "@/lib/email/render-month-end-summary";
import { sendMailerSendEmail } from "@/lib/email/send-mailersend";
import { createAdminClient } from "@/lib/supabase/admin";

type AutomationResult = {
  workspaceId: string;
  workspaceName: string;
  businessEmail: string;
  timeZone: string;
  localDate: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  messageId?: string;
};

export async function GET(request: NextRequest) {
  try {
    authorizeCronRequest(request);

    const admin = createAdminClient();
    const now = new Date();
    const targets = await listMonthEndTargets(admin);
    const results: AutomationResult[] = [];

    for (const target of targets) {
      const localDate = getTimeZoneDateString(now, target.timeZone);

      if (!target.businessEmail) {
        await safeRecordAutoRun(admin, {
          workspaceId: target.workspaceId,
          runType: "auto_check",
          status: "failed",
          reason: "Business email is missing in workspace settings.",
          snapshotMonth: localDate.slice(0, 7),
          snapshotDate: localDate,
          timeZone: target.timeZone
        });

        results.push({
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          businessEmail: "",
          timeZone: target.timeZone,
          localDate,
          status: "skipped",
          reason: "Business email is missing in workspace settings."
        });
        continue;
      }

      if (!isLastDayOfMonthInTimeZone(now, target.timeZone)) {
        await safeRecordAutoRun(admin, {
          workspaceId: target.workspaceId,
          runType: "auto_check",
          status: "skipped",
          reason: "Not the last day of the month in the workspace time zone.",
          recipientEmail: target.businessEmail,
          snapshotMonth: localDate.slice(0, 7),
          snapshotDate: localDate,
          timeZone: target.timeZone
        });

        results.push({
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          businessEmail: target.businessEmail,
          timeZone: target.timeZone,
          localDate,
          status: "skipped",
          reason: "Not the last day of the month in the workspace time zone."
        });
        continue;
      }

      const periodMonth = localDate.slice(0, 7);
      const alreadySent = await hasAutomatedMonthEndSendForPeriod(admin, target.workspaceId, periodMonth);

      if (alreadySent) {
        await safeRecordAutoRun(admin, {
          workspaceId: target.workspaceId,
          runType: "auto_check",
          status: "skipped",
          reason: "Month-end summary already sent for this period.",
          recipientEmail: target.businessEmail,
          snapshotMonth: periodMonth,
          snapshotDate: localDate,
          timeZone: target.timeZone
        });

        results.push({
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          businessEmail: target.businessEmail,
          timeZone: target.timeZone,
          localDate,
          status: "skipped",
          reason: "Month-end summary already sent for this period."
        });
        continue;
      }

      try {
        await safeRecordAutoRun(admin, {
          workspaceId: target.workspaceId,
          runType: "auto_check",
          status: "success",
          reason: "Last day of month confirmed. Delivery attempt started.",
          recipientEmail: target.businessEmail,
          snapshotMonth: periodMonth,
          snapshotDate: localDate,
          timeZone: target.timeZone
        });

        const invoices = await loadWorkspaceMonthEndInvoices(admin, target.workspaceId);
        const summary = buildMonthEndSummary({
          invoices,
          snapshotDate: localDate
        });
        const email = renderMonthEndSummary(summary);
        const recipients = [target.businessEmail];
        const sendResult = await sendMailerSendEmail({
          to: recipients,
          subject: email.subject,
          html: email.html,
          text: email.text
        });

        if (!sendResult.ok) {
          await safeRecordAutoRun(admin, {
            workspaceId: target.workspaceId,
            runType: "auto_send",
            status: "failed",
            reason: sendResult.error,
            recipientEmail: target.businessEmail,
            snapshotMonth: periodMonth,
            snapshotDate: summary.snapshotDate,
            timeZone: target.timeZone,
            metadata: {
              monthLabel: summary.monthLabel,
              receivablesOpenCount: summary.sections.receivables.openCount,
              payablesOpenCount: summary.sections.payables.openCount
            }
          });

          await safeRecordAutoLog(admin, {
            workspaceId: target.workspaceId,
            subject: email.subject,
            recipients,
            periodMonth,
            monthLabel: summary.monthLabel,
            snapshotDate: summary.snapshotDate,
            timeZone: target.timeZone,
            status: "failed",
            errorMessage: sendResult.error
          });

          results.push({
            workspaceId: target.workspaceId,
            workspaceName: target.workspaceName,
            businessEmail: target.businessEmail,
            timeZone: target.timeZone,
            localDate,
            status: "failed",
            reason: sendResult.error
          });
          continue;
        }

        try {
          await recordEmailSendLog(admin, {
            workspaceId: target.workspaceId,
            recipients,
            subject: email.subject,
            status: "sent",
            providerMessageId: sendResult.messageId,
            summarySnapshot: {
              kind: "month_end_auto",
              periodMonth,
              monthLabel: summary.monthLabel,
              snapshotDate: summary.snapshotDate,
              timeZone: target.timeZone,
              sections: {
                receivablesOpenCount: summary.sections.receivables.openCount,
                payablesOpenCount: summary.sections.payables.openCount
              }
            }
          });
        } catch (error) {
          console.error("[MonthEndAutomation] Could not record successful send log", error);
        }

        await safeRecordAutoRun(admin, {
          workspaceId: target.workspaceId,
          runType: "auto_send",
          status: "success",
          recipientEmail: target.businessEmail,
          snapshotMonth: periodMonth,
          snapshotDate: summary.snapshotDate,
          timeZone: target.timeZone,
          providerMessageId: sendResult.messageId ?? null,
          metadata: {
            monthLabel: summary.monthLabel,
            receivablesOpenCount: summary.sections.receivables.openCount,
            payablesOpenCount: summary.sections.payables.openCount
          }
        });

        results.push({
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          businessEmail: target.businessEmail,
          timeZone: target.timeZone,
          localDate,
          status: "sent",
          messageId: sendResult.messageId
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Month-end automation failed.";

        await safeRecordAutoRun(admin, {
          workspaceId: target.workspaceId,
          runType: "auto_send",
          status: "failed",
          reason,
          recipientEmail: target.businessEmail,
          snapshotMonth: periodMonth,
          snapshotDate: localDate,
          timeZone: target.timeZone
        });

        await safeRecordAutoLog(admin, {
          workspaceId: target.workspaceId,
          subject: `Month-End Invoice Summary - ${periodMonth}`,
          recipients: [target.businessEmail],
          periodMonth,
          monthLabel: periodMonth,
          snapshotDate: localDate,
          timeZone: target.timeZone,
          status: "failed",
          errorMessage: reason
        });

        results.push({
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          businessEmail: target.businessEmail,
          timeZone: target.timeZone,
          localDate,
          status: "failed",
          reason
        });
      }
    }

    return NextResponse.json({
      ok: true,
      evaluatedAt: now.toISOString(),
      sentCount: results.filter((result) => result.status === "sent").length,
      skippedCount: results.filter((result) => result.status === "skipped").length,
      failedCount: results.filter((result) => result.status === "failed").length,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Month-end automation failed.";
    const status = error instanceof CronAuthorizationError ? error.status : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

async function safeRecordAutoRun(
  admin: ReturnType<typeof createAdminClient>,
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
    metadata
  }: {
    workspaceId: string;
    runType: "auto_check" | "auto_send";
    status: "success" | "skipped" | "failed";
    reason?: string;
    recipientEmail?: string;
    snapshotMonth: string;
    snapshotDate: string;
    timeZone: string;
    providerMessageId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await recordMonthEndJobRun(admin, {
      workspaceId,
      runType,
      status,
      reason,
      recipientEmail,
      snapshotMonth,
      snapshotDate,
      timeZone,
      providerMessageId,
      metadata
    });
  } catch (error) {
    console.error("[MonthEndAutomation] Could not record automation run", error);
  }
}

function authorizeCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (cronSecret) {
    if (authorization !== `Bearer ${cronSecret}`) {
      throw new CronAuthorizationError("Cron authorization failed.", 401);
    }

    return;
  }

  if (process.env.NODE_ENV !== "production") {
    return;
  }

  throw new CronAuthorizationError("CRON_SECRET must be configured for automated month-end email.", 500);
}

async function safeRecordAutoLog(
  admin: ReturnType<typeof createAdminClient>,
  {
    workspaceId,
    subject,
    recipients,
    periodMonth,
    monthLabel,
    snapshotDate,
    timeZone,
    status,
    errorMessage
  }: {
    workspaceId: string;
    subject: string;
    recipients: string[];
    periodMonth: string;
    monthLabel: string;
    snapshotDate: string;
    timeZone: string;
    status: "failed";
    errorMessage: string;
  }
) {
  try {
    await recordEmailSendLog(admin, {
      workspaceId,
      recipients,
      subject,
      status,
      errorMessage,
      summarySnapshot: {
        kind: "month_end_auto",
        periodMonth,
        monthLabel,
        snapshotDate,
        timeZone
      }
    });
  } catch (error) {
    console.error("[MonthEndAutomation] Could not record email log", error);
  }
}

class CronAuthorizationError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
  }
}
