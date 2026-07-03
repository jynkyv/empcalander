const internalAuthDomain = "ag.local";
const encodedAccountPrefix = "u-";
const base32Alphabet = "abcdefghijklmnopqrstuvwxyz234567";
const plainAccountPattern = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const accountPattern = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,31}$/u;

function encodeBase32(bytes: Uint8Array) {
  let output = "";
  let value = 0;
  let bits = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(value: string) {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of value) {
    const index = base32Alphabet.indexOf(character);

    if (index < 0) {
      return null;
    }

    buffer = (buffer << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }

  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function accountLocalPart(account: string) {
  if (plainAccountPattern.test(account)) {
    return account;
  }

  return `${encodedAccountPrefix}${encodeBase32(new TextEncoder().encode(account))}`;
}

export function getAccountValidationError(value: string) {
  const account = value.trim().toLowerCase();

  if (!account) {
    return "请输入账号";
  }

  if (account.includes("@")) {
    return "账号不能包含 @";
  }

  if (!accountPattern.test(account)) {
    return "账号可使用中文、字母、数字、点、横线和下划线";
  }

  if (accountLocalPart(account).length > 64) {
    return "账号过长";
  }

  return null;
}

export function accountToAuthEmail(value: string) {
  const account = value.trim().toLowerCase();
  return account.includes("@")
    ? account
    : `${accountLocalPart(account)}@${internalAuthDomain}`;
}

export function emailToAccount(email: string) {
  const trimmedEmail = email.trim();
  const normalizedEmail = trimmedEmail.toLowerCase();
  const internalSuffix = `@${internalAuthDomain}`;

  if (!normalizedEmail.endsWith(internalSuffix)) {
    return normalizedEmail;
  }

  const localPart = normalizedEmail.slice(0, -internalSuffix.length);

  if (!localPart.startsWith(encodedAccountPrefix)) {
    return localPart;
  }

  return decodeBase32(localPart.slice(encodedAccountPrefix.length)) || localPart;
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
