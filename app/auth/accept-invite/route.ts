import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const allowedInviteTypes = new Set<EmailOtpType>(["invite", "magiclink"]);

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = getInviteType(requestUrl.searchParams.get("type"));
  const next = getSafeNextPath(requestUrl.searchParams.get("next")) ?? "/auth/update-password";

  if (!tokenHash || !type) {
    return redirectToPasswordPage(requestUrl, "This invite link is missing required details.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type
  });

  if (error) {
    return redirectToPasswordPage(requestUrl, "This invite link is invalid or has expired.");
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

function getInviteType(value: string | null) {
  if (!value || !allowedInviteTypes.has(value as EmailOtpType)) {
    return null;
  }

  return value as EmailOtpType;
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function redirectToPasswordPage(requestUrl: URL, error: string) {
  const redirectUrl = new URL("/auth/update-password", requestUrl.origin);
  redirectUrl.searchParams.set("error", error);

  return NextResponse.redirect(redirectUrl);
}
