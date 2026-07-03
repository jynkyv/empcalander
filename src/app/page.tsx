import { CalendarWorkspace } from "@/components/calendar-workspace";
import { getSupabaseBrowserConfig } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default function Home() {
  return <CalendarWorkspace supabaseConfig={getSupabaseBrowserConfig()} />;
}
