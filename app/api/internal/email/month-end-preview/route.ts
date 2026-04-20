import { NextRequest, NextResponse } from "next/server";

import { buildMonthEndSummary } from "@/lib/email/build-month-end-summary";
import { renderMonthEndSummary } from "@/lib/email/render-month-end-summary";
import { monthEndPreviewRequestSchema } from "@/lib/email/types";

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ ok: false, error: "Internal email tools must be called from this app." }, { status: 403 });
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return NextResponse.json({ ok: false, error: body.error }, { status: 400 });
  }

  const parsed = monthEndPreviewRequestSchema.safeParse(body.data);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid invoice snapshot.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const summary = buildMonthEndSummary(parsed.data);
  const email = renderMonthEndSummary(summary);

  return NextResponse.json({ ok: true, summary, email });
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
