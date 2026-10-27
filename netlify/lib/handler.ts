// Shared wrapper for /api/* functions: GET-only, password gate, per-IP rate limit,
// validation errors → 400, anything else → friendly error (details logged server-side).

import type { Context } from "@netlify/functions";
import type { ApiErrorBody, ApiErrorCode, PlatformChoice, PlatformError } from "../../shared/api.ts";
import { PLATFORMS, type Platform } from "../../shared/types.ts";
import type { ScFetch } from "./adapters/types.ts";
import { checkAuth } from "./auth.ts";
import { getCache } from "./cache.ts";
import { apiError, errorResponse, json, toPlatformError } from "./http.ts";
import {
  AUTH_FAILURE_LIMIT_PER_HOUR,
  CallBudgetExceededError,
  callLimitFromEnv,
  clientIp,
  consume,
  limitFromEnv,
  peek,
} from "./rateLimit.ts";
import { createScFetch } from "./scrapeCreators.ts";
import { ValidationError } from "./validate.ts";

export interface HandlerContext {
  req: Request;
  params: URLSearchParams;
  /** Lazily created Scrape Creators client (cached, allow-listed). */
  sc: () => ScFetch;
}

export interface HandlerOptions {
  /** Count this endpoint against the per-IP hourly limit (default true). */
  rateLimited?: boolean;
}

export type ApiHandler = (req: Request, context: Context) => Promise<Response>;

export function createHandler(
  fn: (ctx: HandlerContext) => Promise<Response>,
  opts: HandlerOptions = {},
): ApiHandler {
  const rateLimited = opts.rateLimited ?? true;
  return async (req, context) => {
    try {
      if (req.method !== "GET") {
        const body: ApiErrorBody = { error: { code: "bad_request", message: "Method not allowed." } };
        return json(body, 405, { allow: "GET" });
      }

      const ip = clientIp(req, context);

      // Brute-force protection for the shared password.
      if ((await peek("auth-fail", ip)) >= AUTH_FAILURE_LIMIT_PER_HOUR) return apiError("rate_limited");

      const auth = checkAuth(req);
      if (!auth.ok) {
        if (auth.code === "unauthorized") await consume("auth-fail", ip, Number.MAX_SAFE_INTEGER);
        return apiError(auth.code);
      }

      if (rateLimited) {
        const result = await consume("api", ip, limitFromEnv());
        if (!result.allowed) {
          return apiError("rate_limited", undefined, { "retry-after": String(result.retryAfterSec) });
        }
      }

      const params = new URL(req.url).searchParams;
      let client: ScFetch | undefined;
      const sc = () => {
        client ??= createScFetch(process.env.SCRAPE_CREATORS_API_KEY ?? "", {
          cache: getCache("sc-cache"),
          beforeUpstream: rateLimited ? () => spendCall(ip) : undefined,
        });
        return client;
      };
      return await fn({ req, params, sc });
    } catch (err) {
      if (err instanceof ValidationError) return apiError("bad_request", err.message);
      return errorResponse(err);
    }
  };
}

async function spendCall(ip: string): Promise<void> {
  const result = await consume("calls", ip, callLimitFromEnv());
  if (!result.allowed) throw new CallBudgetExceededError();
}

export const MAX_RESULTS = 60;

/**
 * Error codes in order of how useful they are to show when every platform failed.
 * (Out of credits beats a generic upstream error, etc.)
 */
const ERROR_PRIORITY: ApiErrorCode[] = [
  "out_of_credits",
  "server_misconfigured",
  "upstream_error",
  "not_found",
  "bad_request",
  "rate_limited",
  "unauthorized",
];

export interface PlatformTask<T> {
  platform: Platform;
  run: () => Promise<T>;
}

export interface Collected<T> {
  results: T[];
  errors: PlatformError[];
  /** True when every platform had no successful task. */
  allFailed: boolean;
}

/**
 * Runs tasks in parallel. A platform counts as failed if any of its tasks failed
 * (one PlatformError per platform), but successful results are still kept.
 */
export async function collectByPlatform<T>(tasks: PlatformTask<T>[]): Promise<Collected<T>> {
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const results: T[] = [];
  const errors = new Map<Platform, PlatformError>();
  const succeeded = new Set<Platform>();
  settled.forEach((outcome, i) => {
    const { platform } = tasks[i];
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
      succeeded.add(platform);
    } else {
      const error = toPlatformError(outcome.reason, platform);
      const existing = errors.get(platform);
      if (!existing || ERROR_PRIORITY.indexOf(error.code) < ERROR_PRIORITY.indexOf(existing.code)) {
        errors.set(platform, error);
      }
    }
  });
  const platforms = new Set(tasks.map((t) => t.platform));
  return {
    results,
    errors: [...errors.values()],
    allFailed: platforms.size > 0 && succeeded.size === 0,
  };
}

/** The most relevant error to return when every platform failed. */
export function worstError(errors: PlatformError[]): Response {
  const sorted = [...errors].sort((a, b) => ERROR_PRIORITY.indexOf(a.code) - ERROR_PRIORITY.indexOf(b.code));
  const first = sorted[0];
  return first ? apiError(first.code, first.message) : apiError("upstream_error");
}

export function platformsFor(choice: PlatformChoice): Platform[] {
  return choice === "all" ? [...PLATFORMS] : [choice];
}
