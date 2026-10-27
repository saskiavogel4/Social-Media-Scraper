import { describe, expect, it } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { PASSWORD_HINT, describeAuthError, describeRedirectError, validateCredentials } from "./authErrors.ts";

const msg = (e: unknown) => describeAuthError(e).message;

describe("describeAuthError", () => {
  it("maps Supabase error codes to friendly copy", () => {
    expect(msg(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"))).toBe("Wrong email or password.");
    expect(msg(new AuthApiError("Email not confirmed", 400, "email_not_confirmed"))).toBe(
      "Please confirm your email first — check your inbox.",
    );
    expect(msg(new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit"))).toBe(
      "Too many attempts, please wait a minute.",
    );
    expect(msg(new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"))).toBe(
      "Too many attempts, please wait a minute.",
    );
    expect(msg(new AuthApiError("User already registered", 422, "user_already_exists"))).toBe(
      "An account with this email already exists — sign in instead.",
    );
    expect(msg(new AuthApiError("Unable to validate email address: invalid format", 400, "email_address_invalid"))).toMatch(
      /valid email/,
    );
    expect(msg(new AuthApiError("Signups not allowed for this instance", 422, "signup_disabled"))).toMatch(/can't be created/);
  });

  it("gives the password hint for weak passwords", () => {
    expect(describeAuthError(new AuthWeakPasswordError("Password should be at least 6 characters.", 422, ["length"])).kind).toBe(
      "weak_password",
    );
    expect(msg(new AuthApiError("weak", 422, "weak_password"))).toContain(PASSWORD_HINT);
  });

  it("falls back to status and message when there is no code", () => {
    expect(msg({ status: 429, message: "Too many" })).toBe("Too many attempts, please wait a minute.");
    expect(msg({ status: 400, message: "Invalid login credentials" })).toBe("Wrong email or password.");
    expect(msg({ status: 400, message: "Email not confirmed" })).toMatch(/confirm your email/);
    expect(msg({ status: 422, message: "User already registered" })).toMatch(/already exists/);
  });

  it("explains network and server problems", () => {
    expect(msg(new AuthRetryableFetchError("Failed to fetch", 0))).toBe("Couldn't reach the sign-in service. Check your connection.");
    expect(msg(new TypeError("Failed to fetch"))).toBe("Couldn't reach the sign-in service. Check your connection.");
    expect(msg(new AuthRetryableFetchError("Bad gateway", 502))).toMatch(/having trouble/);
  });

  it("has a generic fallback", () => {
    expect(msg(new Error("boom"))).toBe("Something went wrong. Please try again.");
    expect(msg(null)).toBe("Something went wrong. Please try again.");
  });
});

describe("validateCredentials", () => {
  it("checks the email first", () => {
    expect(validateCredentials("", "secret123", "sign-in")?.kind).toBe("missing_email");
    expect(validateCredentials("not-an-email", "secret123", "sign-in")?.kind).toBe("invalid_email");
  });

  it("requires a password, and 8+ characters only when creating an account", () => {
    expect(validateCredentials("a@b.co", "", "sign-in")?.kind).toBe("missing_password");
    expect(validateCredentials("a@b.co", "short", "sign-in")).toBeNull();
    expect(validateCredentials("a@b.co", "1234567", "sign-up")?.kind).toBe("weak_password");
    expect(validateCredentials(" a@b.co ", "12345678", "sign-up")).toBeNull();
  });
});

describe("describeRedirectError", () => {
  it("explains expired confirmation links", () => {
    expect(describeRedirectError("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toMatch(
      /expired/,
    );
    expect(describeRedirectError("#error=server_error")).toMatch(/didn't work/);
    expect(describeRedirectError("")).toBeNull();
    expect(describeRedirectError("#access_token=abc")).toBeNull();
  });
});
