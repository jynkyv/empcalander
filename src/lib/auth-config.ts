export const bootstrapAdminEmail = "admin@ag.local";
export const bootstrapAdminPassword = "admin123";

export type SupabaseBrowserConfig = {
  supabasePublishableKey?: string;
  supabaseUrl?: string;
};

export function hasSupabaseConfig(config: SupabaseBrowserConfig) {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}

export function normalizeLoginEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email === "admin" ? bootstrapAdminEmail : email;
}
