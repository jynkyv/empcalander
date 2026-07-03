export const bootstrapAdminEmail = "admin@ag.local";
export const bootstrapAdminPassword = "admin123";

export const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);

export function normalizeLoginEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email === "admin" ? bootstrapAdminEmail : email;
}
