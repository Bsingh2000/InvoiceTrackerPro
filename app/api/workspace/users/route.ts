import { NextRequest, NextResponse } from "next/server";

import { buildAppUrl } from "@/lib/app-url";
import { sendMailerSendEmail } from "@/lib/email/send-mailersend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inviteRoles = ["admin", "member", "viewer"] as const;

type InviteRole = (typeof inviteRoles)[number];

type WorkspaceMemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function GET() {
  try {
    const { admin, workspaceId } = await requireWorkspaceAdmin();
    const members = await listWorkspaceUsers(admin, workspaceId);

    return NextResponse.json({ users: members });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { admin, workspaceId } = await requireWorkspaceAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const fullName = normalizeName(body.fullName);
    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);

    const existingUser = await findAuthUserByEmail(admin, email);
    const redirectTo = buildAppUrl(
      `/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
      request.nextUrl.origin
    );
    const { authUser, actionLink } = await generateWorkspaceInviteLink(admin, {
      email,
      fullName,
      existingUser,
      redirectTo
    });

    if (!authUser?.id) {
      throw new ApiError("Supabase did not return a user for this invite.", 500);
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: authUser.id,
      email,
      full_name: fullName
    });

    if (profileError) {
      throw new ApiError(profileError.message, 500);
    }

    const { error: memberError } = await admin.from("workspace_members").upsert(
      {
        workspace_id: workspaceId,
        user_id: authUser.id,
        role
      },
      {
        onConflict: "workspace_id,user_id"
      }
    );

    if (memberError) {
      throw new ApiError(memberError.message, 500);
    }

    await sendWorkspaceInviteEmail({
      email,
      fullName,
      role,
      actionLink
    });

    return NextResponse.json({
      invited: true,
      user: {
        id: authUser.id,
        email,
        fullName,
        role
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function requireWorkspaceAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new ApiError("Sign in before managing workspace users.", 401);
  }

  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new ApiError(membershipError.message, 500);
  }

  if (!membership) {
    throw new ApiError("Only workspace owners and admins can manage users.", 403);
  }

  return {
    admin,
    user,
    workspaceId: membership.workspace_id as string,
    role: membership.role as string
  };
}

async function listWorkspaceUsers(admin: ReturnType<typeof createAdminClient>, workspaceId: string) {
  const { data: memberRows, error: memberError } = await admin
    .from("workspace_members")
    .select("id, user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (memberError) {
    throw new ApiError(memberError.message, 500);
  }

  const members = (memberRows ?? []) as WorkspaceMemberRow[];
  const userIds = members.map((member) => member.user_id);
  const profilesById = new Map<string, ProfileRow>();

  if (userIds.length) {
    const { data: profileRows, error: profileError } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profileError) {
      throw new ApiError(profileError.message, 500);
    }

    ((profileRows ?? []) as ProfileRow[]).forEach((profile) => {
      profilesById.set(profile.id, profile);
    });
  }

  return members.map((member) => {
    const profile = profilesById.get(member.user_id);

    return {
      id: member.user_id,
      membershipId: member.id,
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? "",
      role: member.role,
      addedAt: member.created_at
    };
  });
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const targetEmail = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new ApiError(error.message, 500);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === targetEmail);

    if (found || data.users.length < perPage) {
      return found ?? null;
    }
  }

  return null;
}

async function generateWorkspaceInviteLink(
  admin: ReturnType<typeof createAdminClient>,
  {
    email,
    fullName,
    existingUser,
    redirectTo
  }: {
    email: string;
    fullName: string;
    existingUser: Awaited<ReturnType<typeof findAuthUserByEmail>>;
    redirectTo: string;
  }
) {
  const preferredType = existingUser ? "magiclink" : "invite";
  let result = await generateEmailLink(admin, {
    type: preferredType,
    email,
    fullName,
    redirectTo
  });

  if (result.error && preferredType === "invite" && isAlreadyRegisteredError(result.error.message)) {
    result = await generateEmailLink(admin, {
      type: "magiclink",
      email,
      fullName,
      redirectTo
    });
  }

  if (result.error) {
    throw new ApiError(result.error.message, 400);
  }

  const { authUser, actionLink } = result;

  if (!authUser?.id || !actionLink) {
    throw new ApiError("Supabase did not return a usable invite link.", 500);
  }

  return { authUser, actionLink };
}

async function generateEmailLink(
  admin: ReturnType<typeof createAdminClient>,
  {
    type,
    email,
    fullName,
    redirectTo
  }: {
    type: "invite" | "magiclink";
    email: string;
    fullName: string;
    redirectTo: string;
  }
) {
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: {
      redirectTo,
      data: {
        full_name: fullName
      }
    }
  });

  return {
    error,
    authUser: data.user,
    actionLink: data.properties?.action_link
  };
}

async function sendWorkspaceInviteEmail({
  email,
  fullName,
  role,
  actionLink
}: {
  email: string;
  fullName: string;
  role: InviteRole;
  actionLink: string;
}) {
  const emailContent = renderWorkspaceInviteEmail({ fullName, role, actionLink });
  const sendResult = await sendMailerSendEmail({
    to: [email],
    subject: "You're invited to Invoice Tracker Pro",
    html: emailContent.html,
    text: emailContent.text
  });

  if (!sendResult.ok) {
    throw new ApiError(`Invite was created, but the email could not be sent: ${sendResult.error}`, 502);
  }
}

function renderWorkspaceInviteEmail({
  fullName,
  role,
  actionLink
}: {
  fullName: string;
  role: InviteRole;
  actionLink: string;
}) {
  const firstName = getFirstName(fullName);
  const safeFirstName = escapeHtml(firstName);
  const safeFullName = escapeHtml(fullName);
  const safeRole = escapeHtml(formatRole(role));
  const safeActionLink = escapeHtml(actionLink);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Invoice Tracker Pro invite</title>
  </head>
  <body style="margin:0;background:#f4f7f6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Set your password and open your Invoice Tracker Pro workspace.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dce5e1;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;border-top:5px solid #047857;">
                <p style="margin:0 0 12px;color:#047857;font-size:12px;font-weight:700;letter-spacing:0;text-transform:uppercase;">Invoice Tracker Pro</p>
                <h1 style="margin:0;color:#111827;font-size:28px;line-height:34px;font-weight:800;">You're invited to your invoice workspace</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:25px;">Hi ${safeFirstName},</p>
                <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:25px;">An administrator added ${safeFullName} to Invoice Tracker Pro as a ${safeRole}. Use the secure link below to set your password and open the workspace.</p>
                <p style="margin:26px 0;">
                  <a href="${safeActionLink}" style="display:inline-block;background:#047857;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;padding:13px 20px;">Accept invitation</a>
                </p>
                <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:22px;">This link is for your account only. If you were not expecting this invite, you can ignore this email.</p>
                <p style="margin:22px 0 0;color:#6b7280;font-size:12px;line-height:19px;">Button not working? Paste this link into your browser:<br><a href="${safeActionLink}" style="color:#047857;word-break:break-all;">${safeActionLink}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "You're invited to your invoice workspace",
    "",
    `Hi ${firstName},`,
    "",
    `An administrator added ${fullName} to Invoice Tracker Pro as a ${formatRole(role)}.`,
    "Use the secure link below to set your password and open the workspace.",
    "",
    actionLink,
    "",
    "If you were not expecting this invite, you can ignore this email."
  ].join("\n");

  return { html, text };
}

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function formatRole(role: InviteRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function isAlreadyRegisteredError(message: string) {
  return /already.*registered|already.*exists|user.*exists/i.test(message);
}

function normalizeName(value: unknown) {
  const fullName = String(value ?? "").trim().replace(/\s+/g, " ");

  if (fullName.length < 2) {
    throw new ApiError("Enter the user's full name.");
  }

  return fullName;
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError("Enter a valid email address.");
  }

  return email;
}

function normalizeRole(value: unknown): InviteRole {
  return inviteRoles.includes(value as InviteRole) ? (value as InviteRole) : "member";
}

function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Workspace user request failed."
    },
    { status: 500 }
  );
}
