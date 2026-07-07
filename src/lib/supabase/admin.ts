import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "@/lib/supabase/env";

export function createAdminClient(): SupabaseClient | null {
  const adminConfig = getSupabaseAdminConfig();

  if (!adminConfig) {
    return null;
  }

  return createSupabaseAdminClient(
    adminConfig.supabaseUrl,
    adminConfig.supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
