// Query-string validation for every /api/* endpoint (contract: shared/api.ts).
// Unknown or repeated params are rejected. Error messages never echo user input.

import { MAX_TERM_LENGTH, MAX_TERMS, TERM_CHARS, TIME_WINDOWS, type PlatformChoice, type TimeWindow } from "../../shared/api.ts";
import { PLATFORMS, type Platform } from "../../shared/types.ts";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export { MAX_TERM_LENGTH };
export const MAX_MIN_VIEWS = 10_000_000_000;
export const MAX_URL_LENGTH = 2048;

// TERM_CHARS is shared with the browser (shared/api.ts) so both sides accept the same terms.
const HAS_ALNUM = /[\p{L}\p{N}]/u;
const HANDLE = /^[A-Za-z0-9._-]{1,64}$/;

export const VIDEO_HOSTS: Record<string, Platform> = {
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "vm.tiktok.com": "tiktok",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
};

function checkKeys(params: URLSearchParams, allowed: readonly string[], repeatable: readonly string[] = []): void {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!allowed.includes(key)) throw new ValidationError("Unknown query parameter.");
    if (seen.has(key) && !repeatable.includes(key)) throw new ValidationError("Repeated query parameter.");
    seen.add(key);
  }
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function parsePlatform(value: string | null): Platform {
  if (value === null || !isPlatform(value)) throw new ValidationError("platform must be tiktok, instagram or youtube.");
  return value;
}

export function parsePlatformChoice(value: string | null): PlatformChoice {
  if (value === "all") return "all";
  if (value === null || !isPlatform(value)) {
    throw new ValidationError("platform must be tiktok, instagram, youtube or all.");
  }
  return value;
}

export function parseWindow(value: string | null): TimeWindow {
  if (value === null || value === "") return "7d";
  if (!(TIME_WINDOWS as readonly string[]).includes(value)) throw new ValidationError("window must be 24h, 7d, 30d or any.");
  return value as TimeWindow;
}

export function parseMinViews(value: string | null): number {
  if (value === null || value === "") return 0;
  if (!/^\d{1,11}$/.test(value)) throw new ValidationError("minViews must be a whole number.");
  const n = Number(value);
  if (n > MAX_MIN_VIEWS) throw new ValidationError("minViews is too large.");
  return n;
}

export function parseTerm(raw: string): string {
  const term = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (term.length < 1 || term.length > MAX_TERM_LENGTH) {
    throw new ValidationError(`Each search term must be 1–${MAX_TERM_LENGTH} characters.`);
  }
  if (!TERM_CHARS.test(term) || !HAS_ALNUM.test(term)) {
    throw new ValidationError("Search terms may contain letters, numbers, spaces and # _ - . ' only.");
  }
  return term;
}

export function parseTerms(values: string[]): string[] {
  if (values.length < 1) throw new ValidationError("Enter at least one search term.");
  if (values.length > MAX_TERMS) throw new ValidationError(`Use at most ${MAX_TERMS} search terms.`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const term = parseTerm(value);
    const key = term.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(term);
    }
  }
  return out;
}

export function parseHandle(value: string | null): string {
  const handle = (value ?? "").trim().replace(/^@/, "");
  if (!HANDLE.test(handle)) {
    throw new ValidationError("Handle must be 1–64 letters, numbers, dots, underscores or hyphens.");
  }
  return handle;
}

export function parseVideoUrl(value: string | null): { url: string; platform: Platform } {
  if (!value || value.length > MAX_URL_LENGTH) throw new ValidationError("A valid video URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("A valid video URL is required.");
  }
  const platform = VIDEO_HOSTS[url.hostname.toLowerCase()];
  if (url.protocol !== "https:" || !platform || url.username || url.password || url.port) {
    throw new ValidationError("The URL must be an https TikTok, Instagram or YouTube link.");
  }
  return { url: url.toString(), platform };
}

export interface SearchQuery {
  platform: PlatformChoice;
  terms: string[];
  window: TimeWindow;
  minViews: number;
}

export function parseSearchQuery(params: URLSearchParams): SearchQuery {
  checkKeys(params, ["platform", "q", "window", "minViews"], ["q"]);
  return {
    platform: parsePlatformChoice(params.get("platform")),
    terms: parseTerms(params.getAll("q")),
    window: parseWindow(params.get("window")),
    minViews: parseMinViews(params.get("minViews")),
  };
}

export interface TrendingQuery {
  platform: PlatformChoice;
  window: TimeWindow;
  minViews: number;
}

export function parseTrendingQuery(params: URLSearchParams): TrendingQuery {
  checkKeys(params, ["platform", "window", "minViews"]);
  return {
    platform: parsePlatformChoice(params.get("platform")),
    window: parseWindow(params.get("window")),
    minViews: parseMinViews(params.get("minViews")),
  };
}

export interface ProfileNicheQuery {
  platform: Platform;
  handle: string;
}

export function parseProfileNicheQuery(params: URLSearchParams): ProfileNicheQuery {
  checkKeys(params, ["platform", "handle"]);
  return { platform: parsePlatform(params.get("platform")), handle: parseHandle(params.get("handle")) };
}

export interface TranscriptQuery {
  platform: Platform;
  url: string;
}

export function parseTranscriptQuery(params: URLSearchParams): TranscriptQuery {
  checkKeys(params, ["platform", "url"]);
  const platform = parsePlatform(params.get("platform"));
  const parsed = parseVideoUrl(params.get("url"));
  if (parsed.platform !== platform) throw new ValidationError("The URL does not match the selected platform.");
  return { platform, url: parsed.url };
}

export function parseEmptyQuery(params: URLSearchParams): void {
  checkKeys(params, []);
}
