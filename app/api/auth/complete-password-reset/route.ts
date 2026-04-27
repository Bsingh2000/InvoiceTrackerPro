import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Sign in before updating your password." }, { status: 401 });
    }

    const appMetadata = toMetadataRecord(user.app_metadata);
    const nextAppMetadata = {
      ...appMetadata,
      must_change_password: false
    } as Record<string, unknown>;

    delete nextAppMetadata.temporary_password_issued_at;

    if (nextAppMetadata.onboarding_method === "temporary_password") {
      delete nextAppMetadata.onboarding_method;
    }

    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: nextAppMetadata
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ cleared: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Password reset could not be completed."
      },
      { status: 500 }
    );
  }
}

function toMetadataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
