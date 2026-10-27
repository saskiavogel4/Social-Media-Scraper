// Friendly copy for Supabase Auth errors and the sign-in form's own checks.
// Works on the error's shape (code / status / name / message), so it doesn't depend on
// supabase-js classes and is easy to unit test.

export type AuthMode = "sign-in" | "sign-up";

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_HINT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "user_exists"
  | "weak_password"
  | "invalid_email"
  | "signups_disabled"
  | "network"
  | "service_down"
  | "missing_email"
  | "missing_password"
  | "unknown";

export interface FriendlyAuthError {
  kind: AuthErrorKind;
  message: string;
}

const MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: "Wrong email or password.",
  email_not_confirmed: "Please confirm your email first — check your inbox.",
  rate_limited: "Too many attempts, please wait a minute.",
  user_exists: "An account with this email already exists — sign in instead.",
  weak_password: `That password is too weak. ${PASSWORD_HINT}`,
  invalid_email: "Enter a valid email address, like name@example.com.",
  signups_disabled: "New accounts can't be created right now. Ask the site owner.",
  network: "Couldn't reach the sign-in service. Check your connection.",
  service_down: "The sign-in service is having trouble. Please try again in a moment.",
  missing_email: "Enter your email address.",
  missing_password: "Enter your password.",
  unknown: "Something went wrong. Please try again.",
};

export function authError(kind: AuthErrorKind): FriendlyAuthError {
  return { kind, message: MESSAGES[kind] };
}

interface ErrorLike {
  code?: unknown;
  status?: unknown;
  name?: unknown;
  message?: unknown;
}

function kindOf(error: unknown): AuthErrorKind {
  if (!error || typeof error !== "object") return "unknown";
  const e = error as ErrorLike;
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : undefined;
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";

  switch (code) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate_limited";
    case "user_already_exists":
    case "email_exists":
      return "user_exists";
    case "weak_password":
      return "weak_password";
    case "email_address_invalid":
    case "email_address_not_authorized":
      return "invalid_email";
    case "signup_disabled":
    case "email_provider_disabled":
      return "signups_disabled";
  }

  // Older Auth servers send no code; fall back to the status and message text.
  if (name === "AuthWeakPasswordError") return "weak_password";
  if (status === 429) return "rate_limited";
  if (message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("already registered") || message.includes("already exists")) return "user_exists";
  if (name === "AuthRetryableFetchError") return status && status >= 500 ? "service_down" : "network";
  if (name === "TypeError" && message.includes("fetch")) return "network";
  if (status !== undefined && status >= 500) return "service_down";
  return "unknown";
}

/** Maps a Supabase Auth error (or a thrown fetch error) to a message for a non-technical user. */
export function describeAuthError(error: unknown): FriendlyAuthError {
  return authError(kindOf(error));
}

/** The form's own checks, run before contacting Supabase. Returns null when the input is fine. */
export function validateCredentials(email: string, password: string, mode: AuthMode): FriendlyAuthError | null {
  const trimmed = email.trim();
  if (!trimmed) return authError("missing_email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return authError("invalid_email");
  if (!password) return authError("missing_password");
  if (mode === "sign-up" && password.length < MIN_PASSWORD_LENGTH) return authError("weak_password");
  return null;
}

/**
 * Supabase sends people back with `#error=...&error_code=...` when a confirmation link is
 * expired or already used. Returns friendly copy for that case, or null.
 */
export function describeRedirectError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error_code");
  if (!params.get("error") && !code) return null;
  if (code === "otp_expired") {
    return "That confirmation link has expired or was already used. Try signing in; if your email isn't confirmed yet, we'll offer to send a new link.";
  }
  return "That sign-in link didn't work. Try signing in with your email and password.";
}
