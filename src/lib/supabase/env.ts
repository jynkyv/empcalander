import type { SupabaseBrowserConfig } from "@/lib/auth-config";

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig {
  return {
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
  };
}

export function requireSupabaseBrowserConfig() {
  const config = getSupabaseBrowserConfig();

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error("SUPABASE_URL または SUPABASE_PUBLISHABLE_KEY が不足しています。");
  }

  return {
    supabasePublishableKey: config.supabasePublishableKey,
    supabaseUrl: config.supabaseUrl,
  };
}

export function getSupabaseAdminConfig() {
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!supabaseUrl || !supabaseSecretKey) {
    return null;
  }

  return {
    supabaseSecretKey,
    supabaseUrl,
  };
}
