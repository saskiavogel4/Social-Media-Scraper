// Shared-password gate (PRD §8.3). Compares sha256 digests with timingSafeEqual so
// neither the password nor its length leaks through response timing.

import { createHash, timingSafeEqual } from "node:crypto";
import { PASSWORD_HEADER } from "../../shared/api.ts";

export type AuthResult = { ok: true } | { ok: false; code: "unauthorized" | "server_misconfigured" };

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function passwordMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

/** True when both required secrets are set (values are never exposed). */
export function serverConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.APP_ACCESS_PASSWORD) && Boolean(env.SCRAPE_CREATORS_API_KEY);
}

export function checkAuth(req: Request, env: NodeJS.ProcessEnv = process.env): AuthResult {
  const expected = env.APP_ACCESS_PASSWORD;
  if (!expected || !env.SCRAPE_CREATORS_API_KEY) {
    console.error("Missing APP_ACCESS_PASSWORD or SCRAPE_CREATORS_API_KEY environment variable");
    return { ok: false, code: "server_misconfigured" };
  }
  const provided = req.headers.get(PASSWORD_HEADER) ?? "";
  // Always run the comparison (even for an empty header) to keep timing uniform.
  const match = passwordMatches(provided, expected);
  return match && provided.length > 0 ? { ok: true } : { ok: false, code: "unauthorized" };
}
