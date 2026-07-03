import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseBrowserConfig } from "@/lib/auth-config";

export function createClient(config: SupabaseBrowserConfig) {
  const { supabasePublishableKey, supabaseUrl } = config;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase のブラウザ設定が不足しています。");
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
