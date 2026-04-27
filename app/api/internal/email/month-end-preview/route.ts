import { NextRequest, NextResponse } from "next/server";

import { buildMonthEndSummary } from "@/lib/email/build-month-end-summary";
import { recordMonthEndJobRun, getWorkspaceMembership } from "@/lib/email/month-end-server";
import { renderMonthEndSummary } from "@/lib/email/render-month-end-summary";
import { monthEndPreviewRequestSchema } from "@/lib/email/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    if (!isInternalRequest(request)) {
      return NextResponse.json({ ok: false, error: "Internal email tools must be called from this app." }, { status: 403 });
    }

    const adminContext = await requireWorkspaceAdminForMonthEndPreview();
    const body = await readJsonBody(request);

    if (!body.ok) {
      await safeRecordManualPreviewRun(adminContext.admin, {
        workspaceId: adminContext.workspaceId,
        createdBy: adminContext.userId,
        status: "failed",
        reason: body.error
      });

      return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
    }

    const parsed = monthEndPreviewRequestSchema.safeParse(body.data);

    if (!parsed.success) {
      await safeRecordManualPreviewRun(adminContext.admin, {
        workspaceId: adminContext.workspaceId,
        createdBy: adminContext.userId,
        status: "failed",
        reason: "Invalid invoice snapshot."
      });

      return NextResponse.json(
        { ok: false, error: "Invalid invoice snapshot.", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const summary = buildMonthEndSummary(parsed.data);
    const email = renderMonthEndSummary(summary);

    await safeRecordManualPreviewRun(adminContext.admin, {
      workspaceId: adminContext.workspaceId,
      createdBy: adminContext.userId,
      status: "success",
      snapshotMonth: summary.snapshotDate.slice(0, 7),
      snapshotDate: summary.snapshotDate,
      metadata: {
        monthLabel: summary.monthLabel,
        receivablesOpenCount: summary.sections.receivables.openCount,
        payablesOpenCount: summary.sections.payables.openCount
      }
    });

    return NextResponse.json({ ok: true, summary, email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Month-end preview failed.";
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

async function requireWorkspaceAdminForMonthEndPreview() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ApiError("Sign in before previewing month-end summary emails.", 401);
  }

  const admin = createAdminClient();
  const membership = await getWorkspaceMembership(admin, user.id);

  if (!membership) {
    throw new ApiError("This account is not assigned to a workspace.", 403);
  }

  if (!["owner", "admin"].includes(membership.role)) {
    throw new ApiError("Only workspace owners and admins can preview month-end summary emails.", 403);
  }

  return {
    admin,
    workspaceId: membership.workspaceId,
    userId: user.id
  };
}

async function safeRecordManualPreviewRun(
  admin: ReturnType<typeof createAdminClient>,
  {
    workspaceId,
    createdBy,
    status,
    reason,
    snapshotMonth,
    snapshotDate,
    metadata
  }: {
    workspaceId: string;
    createdBy: string;
    status: "success" | "failed";
    reason?: string;
    snapshotMonth?: string;
    snapshotDate?: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await recordMonthEndJobRun(admin, {
      workspaceId,
      runType: "manual_preview",
      status,
      reason,
      snapshotMonth,
      snapshotDate,
      metadata,
      createdBy
    });
  } catch (error) {
    console.error("[MonthEndPreview] Could not record preview run", error);
  }
}

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
