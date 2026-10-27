// Fixed-window per-IP rate limiting (PRD §8.2). IPs are sha256-hashed before storage.
// Counters live in Netlify Blobs (strong consistency) with an in-memory fallback.
// Not perfectly atomic under heavy concurrency, which is acceptable for credit protection.

import { createHash } from "node:crypto";
import type { Context } from "@netlify/functions";
import { getCache, type Cache } from "./cache.ts";

export const DEFAULT_LIMIT_PER_HOUR = 30;
/** Failed password attempts allowed per IP per hour before /api/* returns 429. */
export const AUTH_FAILURE_LIMIT_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;
const STORE_NAME = "rate-limit";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfterSec: number;
}

export function limitFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RATE_LIMIT_PER_HOUR;
  if (raw && /^\d{1,6}$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (n > 0) return n;
  }
  return DEFAULT_LIMIT_PER_HOUR;
}

export function clientIp(req: Request, context?: Pick<Context, "ip"> | null): string {
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "";
  return ip.trim().slice(0, 64) || "unknown";
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`trend-scout:${ip}`).digest("hex");
}

export interface RateLimiterOptions {
  cache?: Cache;
  now?: () => number;
  windowMs?: number;
}

/** Counts a request for `bucket` + IP and reports whether it is within `limit`. */
export async function consume(
  bucket: string,
  ip: string,
  limit: number,
  opts: RateLimiterOptions = {},
): Promise<RateLimitResult> {
  const cache = opts.cache ?? getCache(STORE_NAME, { strong: true });
  const now = (opts.now ?? Date.now)();
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowEnd - now) / 1000));
  const key = `rl:${bucket}:${hashIp(ip)}:${windowStart}`;

  const current = (await cache.get<number>(key)) ?? 0;
  const count = typeof current === "number" && Number.isFinite(current) ? current : 0;
  if (count >= limit) return { allowed: false, limit, remaining: 0, retryAfterSec };
  await cache.set(key, count + 1, windowEnd - now);
  return { allowed: true, limit, remaining: limit - count - 1, retryAfterSec };
}

/** Reads the count for `bucket` + IP without incrementing it. */
export async function peek(bucket: string, ip: string, opts: RateLimiterOptions = {}): Promise<number> {
  const cache = opts.cache ?? getCache(STORE_NAME, { strong: true });
  const now = (opts.now ?? Date.now)();
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const value = await cache.get<number>(`rl:${bucket}:${hashIp(ip)}:${windowStart}`);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
