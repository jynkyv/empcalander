import { LoginWorkspace } from "@/components/login-workspace";
import { getSupabaseBrowserConfig } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginWorkspace supabaseConfig={getSupabaseBrowserConfig()} />;
}
