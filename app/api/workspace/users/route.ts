import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { buildAppUrl } from "@/lib/app-url";
import { sendMailerSendEmail } from "@/lib/email/send-mailersend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inviteRoles = ["owner", "admin", "member", "viewer"] as const;
const provisionMethods = ["email_invite", "temporary_password"] as const;

type InviteRole = (typeof inviteRoles)[number];
type ProvisionMethod = (typeof provisionMethods)[number];

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
    const { admin, workspaceId, user: actorUser, role: actorRole } = await requireWorkspaceAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const fullName = normalizeName(body.fullName);
    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);
    const deliveryMethod = normalizeProvisionMethod(body.deliveryMethod);

    if (role === "owner" && actorRole !== "owner") {
      throw new ApiError("Only the current workspace owner can transfer ownership.", 403);
    }

    const existingUser = await findAuthUserByEmail(admin, email);
    let authUser: Awaited<ReturnType<typeof findAuthUserByEmail>>;
    let setupLink: string | null = null;
    let temporaryPassword: string | null = null;
    let replacedExistingPassword = false;

    if (deliveryMethod === "temporary_password") {
      const provisionedUser = await provisionTemporaryPasswordUser(admin, {
        email,
        fullName,
        existingUser
      });
      authUser = provisionedUser.authUser;
      temporaryPassword = provisionedUser.temporaryPassword;
      replacedExistingPassword = provisionedUser.replacedExistingPassword;
    } else {
      const invitedUser = await generateWorkspaceInviteLink(admin, {
        email,
        fullName,
        existingUser,
        fallbackOrigin: request.nextUrl.origin
      });
      authUser = invitedUser.authUser;
      setupLink = invitedUser.setupLink;
    }

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

    if (role === "owner") {
      await transferWorkspaceOwnership(admin, workspaceId, actorUser.id, authUser.id);
    }

    if (deliveryMethod === "email_invite") {
      await sendWorkspaceInviteEmail({
        email,
        fullName,
        role,
        setupLink: setupLink ?? ""
      });
    }

    return NextResponse.json({
      invited: deliveryMethod === "email_invite",
      deliveryMethod,
      ownershipTransferred: role === "owner",
      temporaryPassword: deliveryMethod === "temporary_password" ? temporaryPassword : undefined,
      passwordResetRequired: deliveryMethod === "temporary_password",
      replacedExistingPassword: deliveryMethod === "temporary_password" ? replacedExistingPassword : false,
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

export async function DELETE(request: NextRequest) {
  try {
    const { admin, workspaceId, user: actorUser, role: actorRole } = await requireWorkspaceAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const targetUserId = normalizeUserId(body.userId);

    if (targetUserId === actorUser.id) {
      throw new ApiError("You cannot delete your own access from this panel.", 409);
    }

    const { data: membershipRow, error: membershipError } = await admin
      .from("workspace_members")
      .select("id, user_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (membershipError) {
      throw new ApiError(membershipError.message, 500);
    }

    if (!membershipRow) {
      throw new ApiError("This user is not part of the workspace anymore.", 404);
    }

    const targetRole = String(membershipRow.role);

    if (targetRole === "owner") {
      throw new ApiError("Transfer workspace ownership before deleting the owner.", 409);
    }

    if (actorRole === "admin" && targetRole === "admin") {
      throw new ApiError("Only the workspace owner can delete another admin.", 403);
    }

    const { data: profileRow, error: profileError } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileError) {
      throw new ApiError(profileError.message, 500);
    }

    const { error: deleteMembershipError } = await admin
      .from("workspace_members")
      .delete()
      .eq("id", membershipRow.id);

    if (deleteMembershipError) {
      throw new ApiError(deleteMembershipError.message, 500);
    }

    const { count: remainingMemberships, error: remainingMembershipsError } = await admin
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId);

    if (remainingMembershipsError) {
      throw new ApiError(remainingMembershipsError.message, 500);
    }

    let accountDeleted = false;
    let authDeletionWarning: string | null = null;

    if ((remainingMemberships ?? 0) === 0) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(targetUserId);

      if (deleteUserError) {
        authDeletionWarning = deleteUserError.message;
      } else {
        accountDeleted = true;
      }
    }

    return NextResponse.json({
      removed: true,
      accountDeleted,
      authDeletionWarning,
      user: {
        id: targetUserId,
        email: (profileRow?.email as string | null) ?? "",
        fullName: (profileRow?.full_name as string | null) ?? "",
        role: targetRole
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { admin, workspaceId, user: actorUser, role: actorRole } = await requireWorkspaceAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const targetUserId = normalizeUserId(body.userId);
    const nextRole = normalizeRole(body.role);

    if (targetUserId === actorUser.id) {
      throw new ApiError("You cannot change your own role from this panel.", 409);
    }

    const targetMembership = await getWorkspaceMember(admin, workspaceId, targetUserId);

    if (!targetMembership) {
      throw new ApiError("This user is not part of the workspace anymore.", 404);
    }

    const currentTargetRole = targetMembership.role as InviteRole;

    if (currentTargetRole === "owner" && nextRole !== "owner") {
      throw new ApiError("Transfer workspace ownership instead of changing the current owner role.", 409);
    }

    if (nextRole === "owner" && actorRole !== "owner") {
      throw new ApiError("Only the current workspace owner can transfer ownership.", 403);
    }

    if (currentTargetRole !== nextRole) {
      if (nextRole === "owner") {
        await transferWorkspaceOwnership(admin, workspaceId, actorUser.id, targetUserId);
      } else {
        const { error: updateMembershipError } = await admin
          .from("workspace_members")
          .update({ role: nextRole })
          .eq("id", targetMembership.id);

        if (updateMembershipError) {
          throw new ApiError(updateMembershipError.message, 500);
        }
      }
    }

    const updatedUser = await getWorkspaceUser(admin, workspaceId, targetUserId);

    if (!updatedUser) {
      throw new ApiError("The updated workspace user could not be loaded.", 500);
    }

    return NextResponse.json({
      updated: true,
      ownershipTransferred: nextRole === "owner" && currentTargetRole !== "owner",
      user: updatedUser
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

async function getWorkspaceMember(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  userId: string
) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("id, user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(error.message, 500);
  }

  return (data as WorkspaceMemberRow | null) ?? null;
}

async function getWorkspaceUser(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  userId: string
) {
  const member = await getWorkspaceMember(admin, workspaceId, userId);

  if (!member) {
    return null;
  }

  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new ApiError(profileError.message, 500);
  }

  const profile = (profileRow as ProfileRow | null) ?? null;

  return {
    id: member.user_id,
    membershipId: member.id,
    fullName: profile?.full_name ?? "",
    email: profile?.email ?? "",
    role: member.role,
    addedAt: member.created_at
  };
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
    fallbackOrigin
  }: {
    email: string;
    fullName: string;
    existingUser: Awaited<ReturnType<typeof findAuthUserByEmail>>;
    fallbackOrigin: string;
  }
) {
  const preferredType = existingUser ? "magiclink" : "invite";
  let result = await generateEmailLink(admin, {
    type: preferredType,
    email,
    fullName
  });

  if (result.error && preferredType === "invite" && isAlreadyRegisteredError(result.error.message)) {
    result = await generateEmailLink(admin, {
      type: "magiclink",
      email,
      fullName
    });
  }

  if (result.error) {
    throw new ApiError(result.error.message, 400);
  }

  const { authUser, tokenHash, verificationType } = result;

  if (!authUser?.id || !tokenHash || !isInviteVerificationType(verificationType)) {
    throw new ApiError("Supabase did not return a usable invite link.", 500);
  }

  const setupLink = buildInviteSetupLink({
    tokenHash,
    verificationType,
    fallbackOrigin
  });

  return { authUser, setupLink };
}

async function provisionTemporaryPasswordUser(
  admin: ReturnType<typeof createAdminClient>,
  {
    email,
    fullName,
    existingUser
  }: {
    email: string;
    fullName: string;
    existingUser: Awaited<ReturnType<typeof findAuthUserByEmail>>;
  }
) {
  const temporaryPassword = createTemporaryPassword();
  const nextUserMetadata = mergeAuthMetadata(existingUser?.user_metadata, {
    full_name: fullName,
    name: fullName
  });
  const nextAppMetadata = mergeAuthMetadata(existingUser?.app_metadata, {
    must_change_password: true,
    onboarding_method: "temporary_password",
    temporary_password_issued_at: new Date().toISOString()
  });

  if (existingUser?.id) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: nextUserMetadata,
      app_metadata: nextAppMetadata
    });

    if (error) {
      throw new ApiError(error.message, 400);
    }

    if (!data.user?.id) {
      throw new ApiError("Supabase did not return a user after resetting the temporary password.", 500);
    }

    return {
      authUser: data.user,
      temporaryPassword,
      replacedExistingPassword: true
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: nextUserMetadata,
    app_metadata: nextAppMetadata
  });

  if (error) {
    throw new ApiError(error.message, 400);
  }

  if (!data.user?.id) {
    throw new ApiError("Supabase did not return a user for the temporary password flow.", 500);
  }

  return {
    authUser: data.user,
    temporaryPassword,
    replacedExistingPassword: false
  };
}

async function generateEmailLink(
  admin: ReturnType<typeof createAdminClient>,
  {
    type,
    email,
    fullName
  }: {
    type: "invite" | "magiclink";
    email: string;
    fullName: string;
  }
) {
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: {
      data: {
        full_name: fullName
      }
    }
  });

  return {
    error,
    authUser: data.user,
    tokenHash: data.properties?.hashed_token,
    verificationType: data.properties?.verification_type
  };
}

async function transferWorkspaceOwnership(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  currentOwnerId: string,
  nextOwnerId: string
) {
  const { error: workspaceError } = await admin
    .from("workspaces")
    .update({ owner_id: nextOwnerId })
    .eq("id", workspaceId)
    .eq("owner_id", currentOwnerId);

  if (workspaceError) {
    throw new ApiError(workspaceError.message, 500);
  }

  const { error: newOwnerMembershipError } = await admin
    .from("workspace_members")
    .update({ role: "owner" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", nextOwnerId);

  if (newOwnerMembershipError) {
    throw new ApiError(newOwnerMembershipError.message, 500);
  }

  if (currentOwnerId !== nextOwnerId) {
    const { error: demotePreviousOwnerError } = await admin
      .from("workspace_members")
      .update({ role: "admin" })
      .eq("workspace_id", workspaceId)
      .eq("user_id", currentOwnerId);

    if (demotePreviousOwnerError) {
      throw new ApiError(demotePreviousOwnerError.message, 500);
    }
  }

  const { error: extraOwnerCleanupError } = await admin
    .from("workspace_members")
    .update({ role: "admin" })
    .eq("workspace_id", workspaceId)
    .eq("role", "owner")
    .neq("user_id", nextOwnerId);

  if (extraOwnerCleanupError) {
    throw new ApiError(extraOwnerCleanupError.message, 500);
  }
}

async function sendWorkspaceInviteEmail({
  email,
  fullName,
  role,
  setupLink
}: {
  email: string;
  fullName: string;
  role: InviteRole;
  setupLink: string;
}) {
  const emailContent = renderWorkspaceInviteEmail({ fullName, role, setupLink });
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
  setupLink
}: {
  fullName: string;
  role: InviteRole;
  setupLink: string;
}) {
  const safeFullNameGreeting = escapeHtml(fullName);
  const safeRole = escapeHtml(formatRole(role));
  const safeSetupLink = escapeHtml(setupLink);

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
                <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:25px;">Hi ${safeFullNameGreeting},</p>
                <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:25px;">An administrator added your account to Invoice Tracker Pro as a ${safeRole}. Use the secure link below to set your password and open the workspace.</p>
                <p style="margin:26px 0;">
                  <a href="${safeSetupLink}" style="display:inline-block;background:#047857;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;padding:13px 20px;">Accept invitation</a>
                </p>
                <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:22px;">This link is for your account only. If you were not expecting this invite, you can ignore this email.</p>
                <p style="margin:22px 0 0;color:#6b7280;font-size:12px;line-height:19px;">Button not working? Paste this link into your browser:<br><a href="${safeSetupLink}" style="color:#047857;word-break:break-all;">${safeSetupLink}</a></p>
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
    `Hi ${fullName},`,
    "",
    `An administrator added your account to Invoice Tracker Pro as a ${formatRole(role)}.`,
    "Use the secure link below to set your password and open the workspace.",
    "",
    setupLink,
    "",
    "If you were not expecting this invite, you can ignore this email."
  ].join("\n");

  return { html, text };
}

function buildInviteSetupLink({
  tokenHash,
  verificationType,
  fallbackOrigin
}: {
  tokenHash: string;
  verificationType: "invite" | "magiclink";
  fallbackOrigin: string;
}) {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: verificationType,
    next: "/auth/update-password"
  });

  return buildAppUrl(`/auth/accept-invite?${params.toString()}`, fallbackOrigin);
}

function isInviteVerificationType(value: unknown): value is "invite" | "magiclink" {
  return value === "invite" || value === "magiclink";
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

function normalizeUserId(value: unknown) {
  const userId = String(value ?? "").trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new ApiError("Choose a valid workspace user.");
  }

  return userId;
}

function normalizeProvisionMethod(value: unknown): ProvisionMethod {
  return provisionMethods.includes(value as ProvisionMethod)
    ? (value as ProvisionMethod)
    : "email_invite";
}

function mergeAuthMetadata(
  current: unknown,
  patch: Record<string, unknown>
) {
  return {
    ...toMetadataRecord(current),
    ...patch
  };
}

function toMetadataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function createTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@$%*-_";
  const all = `${upper}${lower}${digits}${symbols}`;
  const characters = [
    pickRandomCharacter(upper),
    pickRandomCharacter(lower),
    pickRandomCharacter(digits),
    pickRandomCharacter(symbols)
  ];

  while (characters.length < 14) {
    characters.push(pickRandomCharacter(all));
  }

  return shuffleCharacters(characters).join("");
}

function pickRandomCharacter(source: string) {
  return source.charAt(randomInt(0, source.length));
}

function shuffleCharacters(characters: string[]) {
  const next = [...characters];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
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
