import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, buildQuery, friendlyError, onUnauthorized, parseErrorResponse } from "./api.ts";
import { getAccessToken } from "./lib/supabase.ts";

// The real client would talk to Supabase; the API client only needs the current access token.
vi.mock("./lib/supabase.ts", () => ({ getAccessToken: vi.fn(async () => "token-123") }));
const tokenMock = vi.mocked(getAccessToken);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const filters = { window: "7d" as const, minViews: 0 };

describe("parseErrorResponse", () => {
  it("reads the ApiErrorBody code and message", async () => {
    const err = await parseErrorResponse(jsonResponse({ error: { code: "out_of_credits", message: "No credits" } }, 402));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("out_of_credits");
    expect(err.message).toBe("No credits");
    expect(err.status).toBe(402);
  });

  it("falls back to the HTTP status for non-JSON bodies", async () => {
    const err = await parseErrorResponse(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(err.code).toBe("upstream_error");
    expect((await parseErrorResponse(new Response("", { status: 429 }))).code).toBe("rate_limited");
    expect((await parseErrorResponse(new Response("", { status: 401 }))).code).toBe("unauthorized");
  });

  it("ignores unknown codes", async () => {
    const err = await parseErrorResponse(jsonResponse({ error: { code: "weird", message: "x" } }, 404));
    expect(err.code).toBe("not_found");
  });
});

describe("buildQuery", () => {
  it("repeats array params and skips undefined", () => {
    expect(buildQuery({ platform: "all", q: ["meal prep", "#booktok"], x: undefined, minViews: 0 })).toBe(
      "?platform=all&q=meal+prep&q=%23booktok&minViews=0",
    );
  });
});

describe("api client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    tokenMock.mockResolvedValue("token-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    onUnauthorized(null);
  });

  const headersOf = (i = 0) => fetchMock.mock.calls[i][1]?.headers as Record<string, string>;

  it("sends the Supabase access token as a Bearer header and repeated q params", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ videos: [], errors: [] }, 200));
    await api.search("tiktok", ["meal prep", "#gymtok"], filters);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/search?platform=tiktok&q=meal+prep&q=%23gymtok&window=7d&minViews=0");
    expect(headersOf().Authorization).toBe("Bearer token-123");
    expect(headersOf()["x-app-password"]).toBeUndefined();
  });

  it("reads the token for every request (so refreshed tokens are used)", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ videos: [], errors: [] }, 200));
    tokenMock.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    await api.trending("tiktok", filters);
    await api.trending("tiktok", filters);
    expect(headersOf(0).Authorization).toBe("Bearer first");
    expect(headersOf(1).Authorization).toBe("Bearer second");
  });

  it("sends no Authorization header when signed out", async () => {
    tokenMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200));
    await api.session();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/session");
    expect(headersOf().Authorization).toBeUndefined();
  });

  it("strips @ from profile handles", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ platform: "tiktok", handle: "me", terms: [], sampleSize: 0 }, 200));
    await api.profileNiche("tiktok", "@me");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/profile-niche?platform=tiktok&handle=me");
  });

  it("throws a typed ApiError and calls the 401 handler", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "unauthorized", message: "Sign in" } }, 401));
    await expect(api.trending("youtube", filters)).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call the 401 handler for other errors", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "rate_limited", message: "Slow down" } }, 429));
    await expect(api.trending("youtube", filters)).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("maps network failures to network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.transcript("tiktok", "https://x")).rejects.toMatchObject({ code: "network_error" });
  });
});

describe("friendlyError", () => {
  it("gives creator-friendly copy", () => {
    expect(friendlyError(new ApiError("out_of_credits", "", 402)).title).toBe("Out of API credits");
    expect(friendlyError(new ApiError("not_found", "", 404), "profile").title).toBe("Profile not found or private");
    expect(friendlyError(new Error("boom")).title).toBe("Something went wrong");
    expect(friendlyError(new ApiError("unauthorized", "", 401)).title).toBe("Please sign in again");
  });
});
