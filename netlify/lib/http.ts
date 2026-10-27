// HTTP helpers shared by every Netlify Function: JSON responses, the error envelope
// from shared/api.ts, and mapping of internal/upstream errors to friendly API errors.
// Upstream bodies, stack traces and secrets never reach the browser.

import type { ApiErrorBody, ApiErrorCode, PlatformError } from "../../shared/api.ts";
import type { Platform } from "../../shared/types.ts";
import { ScrapeCreatorsError } from "./adapters/types.ts";

const BASE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  rate_limited: 429,
  out_of_credits: 402,
  not_found: 404,
  bad_request: 400,
  upstream_error: 502,
  server_misconfigured: 500,
};

export const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: "Wrong or missing access password.",
  rate_limited: "Too many requests. Please wait a while and try again.",
  out_of_credits: "Out of API credits. Top up your Scrape Creators account to keep searching.",
  not_found: "Not found. The profile or video may not exist or may be private.",
  bad_request: "The request was invalid.",
  upstream_error: "The data provider had a problem. Please try again shortly.",
  server_misconfigured: "The server is not configured correctly. Check the Netlify environment variables.",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function apiError(code: ApiErrorCode, message?: string, headers: Record<string, string> = {}): Response {
  const body: ApiErrorBody = { error: { code, message: message ?? DEFAULT_MESSAGES[code] } };
  return json(body, ERROR_STATUS[code], headers);
}

/** Defence in depth: strip secrets from anything we log. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const secret of [env.SCRAPE_CREATORS_API_KEY, env.APP_ACCESS_PASSWORD]) {
    if (secret && secret.length >= 4) out = out.split(secret).join("[redacted]");
  }
  return out.slice(0, 500);
}

export interface MapErrorOptions {
  platform?: Platform;
  /** Profile lookups treat upstream 400/422 as "profile not found or private". */
  lookup?: "profile";
}

export interface MappedError {
  code: ApiErrorCode;
  message: string;
}

/**
 * Maps any thrown value to a safe API error code + message. Logs details server-side
 * (error name, status and our own message only; never request headers or upstream bodies).
 */
export function mapError(err: unknown, opts: MapErrorOptions = {}): MappedError {
  const where = opts.platform ? `[${opts.platform}]` : "";
  if (err instanceof ScrapeCreatorsError) {
    let code: ApiErrorCode;
    if (err.status === 402) code = "out_of_credits";
    else if (err.status === 404) code = "not_found";
    else if (err.status === 400 || err.status === 422) code = opts.lookup === "profile" ? "not_found" : "bad_request";
    else code = "upstream_error";
    if (code === "upstream_error") {
      const hint = err.status === 401 || err.status === 403 ? " (check SCRAPE_CREATORS_API_KEY)" : "";
      console.error(`Scrape Creators error${where}: status ${err.status}${hint}: ${redact(err.message)}`);
    }
    return { code, message: DEFAULT_MESSAGES[code] };
  }
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : "non-error thrown";
  console.error(`Unexpected error${where}: ${redact(`${name}: ${message}`)}`);
  return { code: "upstream_error", message: DEFAULT_MESSAGES.upstream_error };
}

export function errorResponse(err: unknown, opts: MapErrorOptions = {}): Response {
  const { code, message } = mapError(err, opts);
  return apiError(code, message);
}

export function toPlatformError(err: unknown, platform: Platform): PlatformError {
  const { code, message } = mapError(err, { platform });
  return { platform, code, message };
}
