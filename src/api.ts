// Typed client for the app's own /api/* endpoints (see shared/api.ts).
// Never talks to third-party APIs directly; the API key lives only in Netlify Functions.
import {
  PASSWORD_HEADER,
  type ApiErrorBody,
  type ApiErrorCode,
  type PlatformChoice,
  type ProfileNicheResponse,
  type SessionResponse,
  type TimeWindow,
  type TranscriptResponse,
  type VideosResponse,
} from "../shared/api.ts";
import type { Platform } from "../shared/types.ts";
import { getPassword } from "./lib/storage.ts";

/** Client-only codes in addition to the server's ApiErrorCode. */
export type ClientErrorCode = ApiErrorCode | "network_error" | "unknown";

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  constructor(code: ClientErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const KNOWN_CODES: readonly ApiErrorCode[] = [
  "unauthorized",
  "rate_limited",
  "out_of_credits",
  "not_found",
  "bad_request",
  "upstream_error",
  "server_misconfigured",
];

function codeFromStatus(status: number): ClientErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "out_of_credits";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 400) return "bad_request";
  if (status >= 500) return "upstream_error";
  return "unknown";
}

/** Turns a non-2xx Response into an ApiError, tolerating non-JSON bodies. */
export async function parseErrorResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore: HTML error pages, empty bodies, etc.
  }
  const err = (body as Partial<ApiErrorBody> | null)?.error;
  if (err && typeof err.code === "string" && KNOWN_CODES.includes(err.code)) {
    return new ApiError(err.code, typeof err.message === "string" ? err.message : "", res.status);
  }
  return new ApiError(codeFromStatus(res.status), `Request failed (${res.status})`, res.status);
}

type Params = Record<string, string | number | readonly string[] | undefined>;

export function buildQuery(params: Params): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, v));
    else sp.append(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

let unauthorizedHandler: (() => void) | null = null;
/** Called on any 401 so the app can clear the stored password and show the gate. */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  password?: string;
  signal?: AbortSignal;
}

async function get<T>(path: string, params: Params, opts: RequestOptions = {}): Promise<T> {
  const password = opts.password ?? getPassword() ?? "";
  let res: Response;
  try {
    res = await fetch(`/api/${path}${buildQuery(params)}`, {
      method: "GET",
      headers: { [PASSWORD_HEADER]: password, Accept: "application/json" },
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("network_error", "Network request failed", 0);
  }
  if (!res.ok) {
    const error = await parseErrorResponse(res);
    if (error.code === "unauthorized" && opts.password === undefined) unauthorizedHandler?.();
    throw error;
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("upstream_error", "Invalid response from server", res.status);
  }
}

export interface FilterParams {
  window: TimeWindow;
  minViews: number;
}

export const api = {
  /** Verifies a candidate password; does not trigger the global 401 handler. */
  session: (password: string, signal?: AbortSignal) =>
    get<SessionResponse>("session", {}, { password, signal }),

  search: (platform: PlatformChoice, terms: readonly string[], f: FilterParams, signal?: AbortSignal) =>
    get<VideosResponse>(
      "search",
      { platform, q: terms, window: f.window, minViews: f.minViews },
      { signal },
    ),

  trending: (platform: PlatformChoice, f: FilterParams, signal?: AbortSignal) =>
    get<VideosResponse>("trending", { platform, window: f.window, minViews: f.minViews }, { signal }),

  profileNiche: (platform: Platform, handle: string, signal?: AbortSignal) =>
    get<ProfileNicheResponse>("profile-niche", { platform, handle: handle.replace(/^@+/, "").trim() }, { signal }),

  transcript: (platform: Platform, url: string, signal?: AbortSignal) =>
    get<TranscriptResponse>("transcript", { platform, url }, { signal }),
};

/** Human-friendly copy for each error code (non-technical audience). */
export function friendlyError(error: unknown, context: "search" | "profile" | "transcript" | "session" = "search"): {
  title: string;
  detail: string;
} {
  const code: ClientErrorCode = error instanceof ApiError ? error.code : "unknown";
  switch (code) {
    case "out_of_credits":
      return { title: "Out of API credits", detail: "The data provider has run out of credits. Top up the Scrape Creators account, then try again." };
    case "rate_limited":
      return { title: "Too many requests", detail: "You're searching a little too fast. Wait a minute and try again." };
    case "not_found":
      if (context === "profile")
        return { title: "Profile not found or private", detail: "Check the handle and platform. Private accounts can't be analysed." };
      if (context === "transcript")
        return { title: "No transcript available", detail: "This video doesn't have a transcript we can read." };
      return { title: "Nothing found", detail: "We couldn't find that. Try different terms." };
    case "bad_request":
      return { title: "Check your search", detail: error instanceof ApiError && error.message ? error.message : "Something in the search wasn't valid." };
    case "unauthorized":
      return { title: "Wrong password", detail: "That access password didn't work. Check it and try again." };
    case "server_misconfigured":
      return { title: "App isn't set up yet", detail: "The server is missing its configuration. Ask the site owner to check the API key and password settings." };
    case "upstream_error":
      return { title: "The platform didn't respond", detail: "The data source had a hiccup. Try again in a moment." };
    case "network_error":
      return { title: "You appear to be offline", detail: "We couldn't reach the server. Check your connection and try again." };
    default:
      return { title: "Something went wrong", detail: "An unexpected error occurred. Please try again." };
  }
}
