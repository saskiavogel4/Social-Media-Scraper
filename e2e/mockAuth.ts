// A small in-memory stand-in for Supabase Auth (GoTrue), shaped like the real responses that
// @supabase/auth-js reads (see node_modules/@supabase/auth-js/dist/main/lib/fetch.js):
// - sessions: { access_token, token_type, expires_in, expires_at, refresh_token, user }
// - errors: JSON { code, error_code, msg } plus the X-Supabase-Api-Version header (so `code` is used)
// The real project is never contacted; every request to it is answered here.
import type { Route } from "@playwright/test";
import { DEFAULT_SUPABASE_URL } from "../shared/supabaseConfig.ts";

export const SUPABASE_ORIGIN = new URL(DEFAULT_SUPABASE_URL).origin;
/** supabase-js's default storage key: `sb-<project ref>-auth-token`. */
export const STORAGE_KEY = `sb-${new URL(DEFAULT_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** A JWT-shaped access token (supabase-js never verifies the signature in the browser). */
export const ACCESS_TOKEN = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "e2e-user", role: "authenticated" })}.e2e-signature`;
export const REFRESH_TOKEN = "e2e-refresh-token";

export const TEST_USER = { email: "creator@example.com", password: "correct-horse-battery" };

interface Account {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
}

export interface AuthCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

function makeUser(account: Pick<Account, "id" | "email" | "confirmed">) {
  const now = new Date().toISOString();
  return {
    id: account.id,
    aud: "authenticated",
    role: "authenticated",
    email: account.email,
    email_confirmed_at: account.confirmed ? now : undefined,
    confirmation_sent_at: account.confirmed ? undefined : now,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [
      {
        identity_id: `${account.id}-identity`,
        id: account.id,
        user_id: account.id,
        identity_data: { email: account.email, sub: account.id },
        provider: "email",
        created_at: now,
        updated_at: now,
      },
    ],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

/** A session as Supabase returns it (and as supabase-js stores it in localStorage). */
export function makeSession(email: string, id = "e2e-user") {
  return {
    access_token: ACCESS_TOKEN,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: REFRESH_TOKEN,
    user: makeUser({ id, email, confirmed: true }),
  };
}

function authError(status: number, code: string, msg: string) {
  return { status, body: { code, error_code: code, msg } };
}

type Reply = { status: number; body?: unknown };

export class MockAuth {
  readonly calls: AuthCall[] = [];
  /** Requests the mock doesn't understand. Must stay empty. */
  readonly problems: string[] = [];
  /** "confirm": sign-up returns a user but no session (Supabase's "Confirm email" on, the default). */
  signUpMode: "confirm" | "session" = "confirm";
  /** Simulates no connection to Supabase (requests fail at the network level). */
  offline = false;
  private readonly accounts = new Map<string, Account>();
  private nextId = 1;

  constructor() {
    this.addAccount(TEST_USER.email, TEST_USER.password);
  }

  addAccount(email: string, password: string, confirmed = true): void {
    this.accounts.set(email.toLowerCase(), { id: email === TEST_USER.email ? "e2e-user" : `user-${this.nextId++}`, email, password, confirmed });
  }

  callsTo(path: string): AuthCall[] {
    return this.calls.filter((c) => c.path === path && c.method !== "OPTIONS");
  }

  async handle(route: Route, url: URL): Promise<void> {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": request.headers()["origin"] ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "*",
      "access-control-expose-headers": "x-supabase-api-version",
      "x-supabase-api-version": "2024-01-01",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (this.offline) {
      await route.abort("internetdisconnected");
      return;
    }
    let body: Record<string, unknown> | null;
    try {
      body = request.postDataJSON() as Record<string, unknown> | null;
    } catch {
      body = null;
    }
    const path = url.pathname.replace(/^\/auth\/v1/, "");
    const call: AuthCall = { method: request.method(), path, query: url.searchParams, body, authorization: request.headers()["authorization"] ?? null };
    this.calls.push(call);

    const reply = this.reply(call);
    await route.fulfill({
      status: reply.status,
      headers: { ...cors, ...(reply.body === undefined ? {} : { "content-type": "application/json" }) },
      body: reply.body === undefined ? "" : JSON.stringify(reply.body),
    });
  }

  private reply(call: AuthCall): Reply {
    const key = `${call.method} ${call.path}`;
    const email = typeof call.body?.email === "string" ? call.body.email : "";
    const password = typeof call.body?.password === "string" ? call.body.password : "";
    const account = this.accounts.get(email.toLowerCase());

    if (key === "POST /token" && call.query.get("grant_type") === "password") {
      if (!account || account.password !== password) return authError(400, "invalid_credentials", "Invalid login credentials");
      if (!account.confirmed) return authError(400, "email_not_confirmed", "Email not confirmed");
      return { status: 200, body: makeSession(account.email, account.id) };
    }
    if (key === "POST /token" && call.query.get("grant_type") === "refresh_token") {
      return { status: 200, body: makeSession(TEST_USER.email) };
    }
    if (key === "POST /signup") {
      if (password.length < 6) return authError(422, "weak_password", "Password should be at least 6 characters.");
      if (account) {
        // With "Confirm email" on, Supabase hides existing accounts: a user with no identities and no session.
        if (this.signUpMode === "confirm") return { status: 200, body: { ...makeUser(account), identities: [] } };
        return authError(422, "user_already_exists", "User already registered");
      }
      const confirmed = this.signUpMode === "session";
      this.addAccount(email, password, confirmed);
      const created = this.accounts.get(email.toLowerCase())!;
      return { status: 200, body: confirmed ? makeSession(created.email, created.id) : makeUser(created) };
    }
    if (key === "POST /resend") {
      if (call.body?.type !== "signup") this.problems.push(`resend with unexpected type ${String(call.body?.type)}`);
      return { status: 200, body: {} };
    }
    if (key === "GET /user") {
      if (call.authorization !== `Bearer ${ACCESS_TOKEN}`) return authError(403, "bad_jwt", "invalid JWT");
      return { status: 200, body: makeUser({ id: "e2e-user", email: TEST_USER.email, confirmed: true }) };
    }
    if (key === "POST /logout") return { status: 204 };

    this.problems.push(`Unmocked Supabase Auth call ${call.method} ${call.path}?${call.query}`);
    return authError(404, "not_found", "Not found");
  }

  /** Marks a pending sign-up as confirmed (as if the user clicked the email link). */
  confirm(email: string): void {
    const account = this.accounts.get(email.toLowerCase());
    if (account) account.confirmed = true;
  }
}
