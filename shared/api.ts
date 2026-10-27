// HTTP contract between the browser and the Netlify Functions.
// All endpoints are GET, require the `x-app-password` header (except /api/health),
// and return either the documented body or an ApiErrorBody with a non-2xx status.

import type { Platform, Video } from "./types.ts";

export const PASSWORD_HEADER = "x-app-password";

export type PlatformChoice = Platform | "all";
export const TIME_WINDOWS = ["24h", "7d", "30d", "any"] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];
export const MAX_TERMS = 5;
/** Longest search term (after trimming) the API accepts. */
export const MAX_TERM_LENGTH = 60;
/** Characters a search term may contain (the server rejects anything else). */
export const TERM_CHARS = /^[\p{L}\p{M}\p{N} #_\-.']+$/u;
const TERM_DISALLOWED = /[^\p{L}\p{M}\p{N} #_\-.']/gu;

/**
 * Makes user input safe to send as a search term: drops disallowed characters (emoji, &, / …),
 * collapses whitespace, joins "# tag" into "#tag" and caps the length.
 * Returns "" when nothing searchable is left.
 */
export function sanitizeTerm(raw: string): string {
  let t = raw.replace(TERM_DISALLOWED, " ").trim().replace(/\s+/g, " ");
  if (t.startsWith("#")) t = `#${t.slice(1).replace(/\s+/g, "")}`;
  t = t.slice(0, MAX_TERM_LENGTH).trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : "";
}

export interface PlatformError {
  platform: Platform;
  code: ApiErrorCode;
  message: string;
}

/**
 * GET /api/search?platform=<PlatformChoice>&q=<term>&q=<term>...&window=<TimeWindow>&minViews=<int>
 *   q: 1..MAX_TERMS terms; a term starting with "#" is a hashtag search, otherwise a keyword search.
 * GET /api/trending?platform=<PlatformChoice>&window=<TimeWindow>&minViews=<int>
 * Both return VideosResponse, sorted by trendScore descending.
 * If some platforms fail in "all" mode, the others are still returned and failures are listed in `errors`.
 */
export interface VideosResponse {
  videos: Video[];
  errors: PlatformError[];
}

/** GET /api/profile-niche?platform=<Platform>&handle=<handle without @> */
export interface ProfileNicheResponse {
  platform: Platform;
  handle: string;
  followers?: number;
  /** Suggested search terms, most relevant first (hashtags keep their leading "#"). */
  terms: string[];
  /** Number of the creator's posts the terms were extracted from. */
  sampleSize: number;
}

/** GET /api/transcript?platform=<Platform>&url=<original video URL> */
export interface TranscriptResponse {
  transcript: string | null;
}

/** GET /api/session — returns 200 { ok: true } if the password header is correct, else 401. */
export interface SessionResponse {
  ok: true;
}

export type ApiErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "out_of_credits"
  | "not_found"
  | "bad_request"
  | "upstream_error"
  | "server_misconfigured";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
