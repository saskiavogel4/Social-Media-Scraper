// Server-side Scrape Creators client. The only place the API key is used.
// - Only allow-listed paths (ALLOWED_PATHS) can be called: never an open proxy.
// - The key is sent as the `x-api-key` header; it is never part of URLs, cache keys,
//   log lines or error messages.
// - Successful responses are cached (see TTLS) to protect API credits.

import { ALLOWED_PATHS, ScrapeCreatorsError, type AllowedPath, type ScFetch } from "./adapters/types.ts";
import type { Cache } from "./cache.ts";

export const SC_BASE_URL = "https://api.scrapecreators.com";
export const DEFAULT_TIMEOUT_MS = 15_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TRENDING_SEARCH_TTL = 45 * MINUTE;
const PROFILE_TRANSCRIPT_TTL = 24 * HOUR;

export const TTLS: Record<AllowedPath, number> = {
  "/v1/tiktok/get-trending-feed": TRENDING_SEARCH_TTL,
  "/v1/tiktok/search/keyword": TRENDING_SEARCH_TTL,
  "/v1/tiktok/search/top": TRENDING_SEARCH_TTL,
  "/v1/tiktok/search/hashtag": TRENDING_SEARCH_TTL,
  "/v1/tiktok/profile": PROFILE_TRANSCRIPT_TTL,
  "/v3/tiktok/profile/videos": PROFILE_TRANSCRIPT_TTL,
  "/v1/tiktok/video/transcript": PROFILE_TRANSCRIPT_TTL,
  "/v1/instagram/reels/trending": TRENDING_SEARCH_TTL,
  "/v2/instagram/reels/search": TRENDING_SEARCH_TTL,
  "/v1/instagram/search/hashtag": TRENDING_SEARCH_TTL,
  "/v1/instagram/profile": PROFILE_TRANSCRIPT_TTL,
  "/v1/instagram/user/reels": PROFILE_TRANSCRIPT_TTL,
  "/v2/instagram/media/transcript": PROFILE_TRANSCRIPT_TTL,
  "/v1/youtube/shorts/trending": TRENDING_SEARCH_TTL,
  "/v1/youtube/search": TRENDING_SEARCH_TTL,
  "/v1/youtube/search/hashtag": TRENDING_SEARCH_TTL,
  "/v1/youtube/channel": PROFILE_TRANSCRIPT_TTL,
  "/v1/youtube/channel/shorts": PROFILE_TRANSCRIPT_TTL,
  "/v1/youtube/video/transcript": PROFILE_TRANSCRIPT_TTL,
};

const ALLOWED = new Set<string>(ALLOWED_PATHS);
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_PARAM_VALUE = 2048;
const MAX_PARAMS = 10;

export interface ScFetchOptions {
  /** Cache for successful responses. Omit to disable caching. */
  cache?: Cache;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Runs before every uncached upstream call (i.e. every call that spends credits); may throw to block it. */
  beforeUpstream?: () => Promise<void>;
}

export function isAllowedPath(path: string): path is AllowedPath {
  return ALLOWED.has(path);
}

function checkParams(params: Record<string, string>): [string, string][] {
  const entries = Object.entries(params);
  if (entries.length > MAX_PARAMS) throw new ScrapeCreatorsError(400, "Too many upstream params");
  for (const [name, value] of entries) {
    if (!PARAM_NAME.test(name) || typeof value !== "string" || value.length > MAX_PARAM_VALUE) {
      throw new ScrapeCreatorsError(400, "Invalid upstream param");
    }
  }
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Cache key: path + sorted params. Never includes the API key. */
export function cacheKey(path: AllowedPath, params: Record<string, string>): string {
  const qs = new URLSearchParams(checkParams(params)).toString();
  return `sc:v1:${path}?${qs}`;
}

/** Builds the upstream URL from the fixed base + allow-listed path. */
export function buildUrl(path: string, params: Record<string, string>): URL {
  if (!isAllowedPath(path)) throw new ScrapeCreatorsError(400, "Path not allowed");
  const url = new URL(path, SC_BASE_URL);
  if (url.origin !== SC_BASE_URL || url.pathname !== path) throw new ScrapeCreatorsError(400, "Path not allowed");
  for (const [name, value] of checkParams(params)) url.searchParams.set(name, value);
  return url;
}

export function createScFetch(apiKey: string, opts: ScFetchOptions = {}): ScFetch {
  if (!apiKey) throw new Error("Scrape Creators API key is not configured");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cache = opts.cache;

  async function callUpstream(path: AllowedPath, url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        headers: { "x-api-key": apiKey, accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
      });
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        console.error(`Scrape Creators timeout after ${timeoutMs}ms: ${path}`);
        throw new ScrapeCreatorsError(504, "Scrape Creators request timed out");
      }
      console.error(`Scrape Creators network error: ${path}: ${err instanceof Error ? err.name : "Error"}`);
      throw new ScrapeCreatorsError(502, "Could not reach Scrape Creators");
    }
    try {
      if (!res.ok) {
        // Drain the body but keep it server-side; it is never returned to the browser.
        await res.text().catch(() => "");
        console.error(`Scrape Creators HTTP ${res.status}: ${path}`);
        throw new ScrapeCreatorsError(res.status, `Scrape Creators request failed (HTTP ${res.status})`);
      }
      try {
        return await res.json();
      } catch {
        console.error(`Scrape Creators returned invalid JSON: ${path}`);
        throw new ScrapeCreatorsError(502, "Scrape Creators returned an invalid response");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return async (path, params) => {
    // Re-check at runtime: callers might bypass the type system.
    const url = buildUrl(path, params);
    const key = cacheKey(path, params);
    if (cache) {
      const hit = await cache.get(key).catch(() => undefined);
      if (hit !== undefined) return hit;
    }
    await opts.beforeUpstream?.();
    const data = await callUpstream(path, url);
    if (cache) await cache.set(key, data, TTLS[path]).catch(() => undefined);
    return data;
  };
}
