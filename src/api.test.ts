import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, buildQuery, friendlyError, onUnauthorized, parseErrorResponse } from "./api.ts";

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
  const store = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    store.set("trendscout.password", "s3cret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    store.clear();
    onUnauthorized(null);
  });

  it("sends the password header and repeated q params", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ videos: [], errors: [] }, 200));
    await api.search("tiktok", ["meal prep", "#gymtok"], filters);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/search?platform=tiktok&q=meal+prep&q=%23gymtok&window=7d&minViews=0");
    expect((init?.headers as Record<string, string>)["x-app-password"]).toBe("s3cret");
  });

  it("strips @ from profile handles", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ platform: "tiktok", handle: "me", terms: [], sampleSize: 0 }, 200));
    await api.profileNiche("tiktok", "@me");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/profile-niche?platform=tiktok&handle=me");
  });

  it("throws a typed ApiError and calls the 401 handler", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "unauthorized", message: "Bad password" } }, 401));
    await expect(api.trending("youtube", filters)).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call the 401 handler when checking a candidate password", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "unauthorized", message: "nope" } }, 401));
    await expect(api.session("wrong")).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["x-app-password"]).toBe("wrong");
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
  });
});
