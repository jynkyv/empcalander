import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseBrowserConfig } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { supabasePublishableKey, supabaseUrl } = requireSupabaseBrowserConfig();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Proxy handles session refresh.
        }
      },
    },
  });
}
