import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase/env";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  if (!serviceRoleKey) {
    throw new Error("Missing required server environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  const { url } = getSupabaseConfig();

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
