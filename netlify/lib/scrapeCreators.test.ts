import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeCreatorsError, type AllowedPath } from "./adapters/types.ts";
import { MemoryCache } from "./cache.ts";
import { TTLS, buildUrl, cacheKey, createScFetch } from "./scrapeCreators.ts";

const KEY = "sk_test_SUPER_SECRET_123";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function mockFetch(impl: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => impl(new URL(String(input)), init ?? {}));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("allow-list", () => {
  it("rejects paths that are not allow-listed, without calling fetch", async () => {
    const fetchImpl = mockFetch(() => okResponse({}));
    const sc = createScFetch(KEY, { fetchImpl });
    for (const path of ["/v1/tiktok/anything", "https://evil.example.com/x", "//evil.example.com/v1/tiktok/profile", "/v1/tiktok/profile/../../x", "/v1/tiktok/profile?x=1"]) {
      await expect(sc(path as AllowedPath, {})).rejects.toBeInstanceOf(ScrapeCreatorsError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("only ever builds URLs on the Scrape Creators host", () => {
    const url = buildUrl("/v1/tiktok/profile", { handle: "a&b=c" });
    expect(url.origin).toBe("https://api.scrapecreators.com");
    expect(url.searchParams.get("handle")).toBe("a&b=c");
    expect(url.searchParams.has("b")).toBe(false);
  });

  it("rejects invalid param names and oversized values", async () => {
    const fetchImpl = mockFetch(() => okResponse({}));
    const sc = createScFetch(KEY, { fetchImpl });
    await expect(sc("/v1/tiktok/profile", { "bad name": "x" })).rejects.toBeInstanceOf(ScrapeCreatorsError);
    await expect(sc("/v1/tiktok/profile", { handle: "x".repeat(3000) })).rejects.toBeInstanceOf(ScrapeCreatorsError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("has a TTL for every allow-listed path", () => {
    expect(TTLS["/v1/tiktok/search/keyword"]).toBe(45 * 60_000);
    expect(TTLS["/v1/youtube/video/transcript"]).toBe(24 * 3_600_000);
    expect(TTLS["/v3/tiktok/profile/videos"]).toBe(24 * 3_600_000);
  });

  it("refuses to construct without a key", () => {
    expect(() => createScFetch("")).toThrow();
  });
});

describe("request and key handling", () => {
  it("sends the key only as the x-api-key header", async () => {
    const fetchImpl = mockFetch(() => okResponse({ ok: 1 }));
    const sc = createScFetch(KEY, { fetchImpl });
    await expect(sc("/v1/tiktok/search/keyword", { query: "cats" })).resolves.toEqual({ ok: 1 });
    const [input, init] = fetchImpl.mock.calls[0];
    expect(String(input)).toBe("https://api.scrapecreators.com/v1/tiktok/search/keyword?query=cats");
    expect(String(input)).not.toContain(KEY);
    expect(new Headers(init?.headers).get("x-api-key")).toBe(KEY);
  });

  it("maps non-2xx to ScrapeCreatorsError without the key or upstream body", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = mockFetch(() => new Response(`{"message":"invalid key ${KEY} SECRET_BODY"}`, { status: 401 }));
    const sc = createScFetch(KEY, { fetchImpl });
    const err = await sc("/v1/tiktok/profile", { handle: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScrapeCreatorsError);
    expect((err as ScrapeCreatorsError).status).toBe(401);
    expect((err as Error).message).not.toContain(KEY);
    expect((err as Error).message).not.toContain("SECRET_BODY");
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("SECRET_BODY");
  });

  it("preserves 402 status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sc = createScFetch(KEY, { fetchImpl: mockFetch(() => new Response("no credits", { status: 402 })) });
    await expect(sc("/v1/youtube/search", { query: "x" })).rejects.toMatchObject({ status: 402 });
  });

  it("times out with a 504 ScrapeCreatorsError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const sc = createScFetch(KEY, { fetchImpl, timeoutMs: 10 });
    await expect(sc("/v1/youtube/search", { query: "x" })).rejects.toMatchObject({ status: 504 });
  });

  it("maps network failures and invalid JSON to 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const netFail = createScFetch(KEY, { fetchImpl: mockFetch(() => Promise.reject(new TypeError("fetch failed"))) });
    await expect(netFail("/v1/youtube/search", { query: "x" })).rejects.toMatchObject({ status: 502 });
    const badJson = createScFetch(KEY, { fetchImpl: mockFetch(() => new Response("<html>", { status: 200 })) });
    await expect(badJson("/v1/youtube/search", { query: "x" })).rejects.toMatchObject({ status: 502 });
  });
});

describe("caching", () => {
  it("cache key is path + sorted params and never contains the key", () => {
    expect(cacheKey("/v1/youtube/search", { b: "2", a: "1" })).toBe(cacheKey("/v1/youtube/search", { a: "1", b: "2" }));
    expect(cacheKey("/v1/youtube/search", { a: "1" })).not.toContain(KEY);
  });

  it("hits, misses and expires", async () => {
    let now = 1_000_000;
    const cache = new MemoryCache({ now: () => now });
    const fetchImpl = mockFetch(() => okResponse({ n: fetchImpl.mock.calls.length }));
    const sc = createScFetch(KEY, { fetchImpl, cache });

    const first = await sc("/v1/tiktok/search/keyword", { query: "cats", region: "US" });
    const second = await sc("/v1/tiktok/search/keyword", { region: "US", query: "cats" });
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await sc("/v1/tiktok/search/keyword", { query: "dogs" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    now += 46 * 60_000; // past the 45 min search TTL
    await sc("/v1/tiktok/search/keyword", { query: "cats", region: "US" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("caches profiles for 24h", async () => {
    let now = 0;
    const cache = new MemoryCache({ now: () => now });
    const fetchImpl = mockFetch(() => okResponse({}));
    const sc = createScFetch(KEY, { fetchImpl, cache });
    await sc("/v1/tiktok/profile", { handle: "a" });
    now += 23 * 3_600_000;
    await sc("/v1/tiktok/profile", { handle: "a" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 2 * 3_600_000;
    await sc("/v1/tiktok/profile", { handle: "a" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not cache errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = new MemoryCache();
    let status = 500;
    const fetchImpl = mockFetch(() => (status === 200 ? okResponse({ ok: true }) : new Response("x", { status })));
    const sc = createScFetch(KEY, { fetchImpl, cache });
    await expect(sc("/v1/youtube/search", { query: "x" })).rejects.toBeInstanceOf(ScrapeCreatorsError);
    status = 200;
    await expect(sc("/v1/youtube/search", { query: "x" })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("still works when the cache throws", async () => {
    const cache = { get: vi.fn().mockRejectedValue(new Error("down")), set: vi.fn().mockRejectedValue(new Error("down")) };
    const sc = createScFetch(KEY, { fetchImpl: mockFetch(() => okResponse({ a: 1 })), cache });
    await expect(sc("/v1/youtube/search", { query: "x" })).resolves.toEqual({ a: 1 });
  });
});
