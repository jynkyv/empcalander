const internalAuthDomain = "ag.local";

export function accountToAuthEmail(value: string) {
  const account = value.trim().toLowerCase();
  return account.includes("@") ? account : `${account}@${internalAuthDomain}`;
}

export function emailToAccount(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const internalSuffix = `@${internalAuthDomain}`;

  return normalizedEmail.endsWith(internalSuffix)
    ? normalizedEmail.slice(0, -internalSuffix.length)
    : normalizedEmail;
}

export type SupabaseBrowserConfig = {
  supabasePublishableKey?: string;
  supabaseUrl?: string;
};

export function hasSupabaseConfig(config: SupabaseBrowserConfig) {
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}

export function normalizeLoginEmail(value: string) {
  return accountToAuthEmail(value);
}
