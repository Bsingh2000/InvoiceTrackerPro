import { NextRequest, NextResponse } from "next/server";

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
    let authUser = existingUser;
    let inviteSent = false;

    if (!authUser) {
      const redirectTo = `${request.nextUrl.origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          full_name: fullName
        }
      });

      if (error) {
        throw new ApiError(error.message, 400);
      }

      authUser = data.user;
      inviteSent = true;
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

    return NextResponse.json({
      invited: inviteSent,
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
