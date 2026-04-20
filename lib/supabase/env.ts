type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function readRequiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    publishableKey: readRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabasePublishableKey)
  };
}
