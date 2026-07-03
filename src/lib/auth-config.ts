export const adminAliasEmail = "admin@ag.local";

export type SupabaseBrowserConfig = {
  supabasePublishableKey?: string;
  supabaseUrl?: string;
};

export function hasSupabaseConfig(config: SupabaseBrowserConfig) {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}

export function normalizeLoginEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email === "admin" ? adminAliasEmail : email;
}
