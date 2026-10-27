// Account gate: every /api/* request must carry a Supabase access token
// (`Authorization: Bearer <token>`) for a signed-in user. The token is checked with
// Supabase Auth itself (GET /auth/v1/user), which works whatever signing keys the
// project uses. Valid tokens are remembered briefly so a burst of requests costs one check.

import { createHash } from "node:crypto";
import { DEFAULT_SUPABASE_PUBLISHABLE_KEY, DEFAULT_SUPABASE_URL } from "../../shared/supabaseConfig.ts";

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; code: "unauthorized" | "server_misconfigured" | "upstream_error" };

const VERIFY_TIMEOUT_MS = 8000;
const TOKEN_CACHE_MS = 60_000;
const TOKEN_CACHE_MAX = 500;
const MAX_TOKEN_LENGTH = 4096;

const verified = new Map<string, { userId: string; until: number }>();

export function supabaseSettings(env: NodeJS.ProcessEnv = process.env): { url: string; key: string } {
  return {
    url: (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ""),
    key: env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** True when the Scrape Creators key is set (the value is never exposed). */
export function serverConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SCRAPE_CREATORS_API_KEY);
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  return token && token.length <= MAX_TOKEN_LENGTH ? token : undefined;
}

/** For tests. */
export function clearAuthCache(): void {
  verified.clear();
}

export interface CheckAuthOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export async function checkAuth(req: Request, opts: CheckAuthOptions = {}): Promise<AuthResult> {
  const env = opts.env ?? process.env;
  const now = (opts.now ?? Date.now)();
  if (!serverConfigured(env)) {
    console.error("Missing SCRAPE_CREATORS_API_KEY environment variable");
    return { ok: false, code: "server_misconfigured" };
  }

  const token = bearerToken(req);
  if (!token) return { ok: false, code: "unauthorized" };

  const cacheKey = createHash("sha256").update(token).digest("hex");
  const hit = verified.get(cacheKey);
  if (hit && hit.until > now) return { ok: true, userId: hit.userId };

  const { url, key } = supabaseSettings(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}`, accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
  } catch (err) {
    console.error(`Supabase auth check failed: ${err instanceof Error ? err.name : "Error"}`);
    return { ok: false, code: "upstream_error" };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    await res.text().catch(() => "");
    return { ok: false, code: "unauthorized" };
  }
  if (!res.ok) {
    await res.text().catch(() => "");
    console.error(`Supabase auth check returned HTTP ${res.status}`);
    return { ok: false, code: "upstream_error" };
  }

  const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
  if (!user || typeof user.id !== "string" || !user.id) return { ok: false, code: "unauthorized" };

  if (verified.size >= TOKEN_CACHE_MAX) verified.clear();
  verified.set(cacheKey, { userId: user.id, until: now + TOKEN_CACHE_MS });
  return { ok: true, userId: user.id };
}
