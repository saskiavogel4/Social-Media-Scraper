// Function-level tests. Adapters, scoring and niche extraction are mocked; Netlify Blobs
// is made unavailable so the in-memory fallback is exercised. No network access.
import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Platform, Video } from "../../shared/types.ts";
import { ScrapeCreatorsError, type PlatformAdapter, type ScFetch } from "../lib/adapters/types.ts";
import { resetMemoryCaches } from "../lib/cache.ts";

vi.mock("@netlify/blobs", () => ({
  getStore: () => {
    throw new Error("MissingBlobsEnvironmentError");
  },
}));

const adapterMocks = vi.hoisted(() => {
  const make = (platform: string) => ({
    platform,
    trending: vi.fn(),
    search: vi.fn(),
    profile: vi.fn(),
    transcript: vi.fn(),
  });
  return { tiktok: make("tiktok"), instagram: make("instagram"), youtube: make("youtube") };
});

vi.mock("../lib/adapters/index.ts", () => ({ adapters: adapterMocks }));

vi.mock("../../shared/scoring.ts", () => ({
  dedupeVideos: vi.fn((videos: Video[]) => videos.filter((v, i) => videos.findIndex((w) => w.id === v.id) === i)),
  filterVideos: vi.fn((videos: Video[], opts: { minViews: number }) =>
    videos.filter((v) => (v.stats.views ?? 0) >= opts.minViews),
  ),
  scoreVideos: vi.fn((videos: Video[]) => videos.map((v) => ({ ...v, trendScore: (v.stats.views ?? 0) % 101 }))),
}));

vi.mock("../../shared/niche.ts", () => ({
  extractNicheTerms: vi.fn(() => ["#fitness", "workout"]),
}));

const { default: session } = await import("./session.ts");
const { default: search } = await import("./search.ts");
const { default: trending } = await import("./trending.ts");
const { default: profileNiche } = await import("./profile-niche.ts");
const { default: transcript } = await import("./transcript.ts");
const scoring = await import("../../shared/scoring.ts");

const PASSWORD = "correct horse";
const API_KEY = "sk_live_TOP_SECRET_KEY";
let ipCounter = 0;
let ip = "";

function video(id: string, platform: Platform, views: number): Video {
  return {
    id,
    platform,
    url: `https://example.com/${id}`,
    thumbnailUrl: "",
    caption: "",
    hashtags: [],
    author: { handle: "a" },
    stats: { views },
    trendScore: 0,
  };
}

function call(
  handler: (req: Request, ctx: Context) => Promise<Response>,
  path: string,
  init: { password?: string | null; method?: string; ip?: string } = {},
) {
  const headers: Record<string, string> = {};
  const password = init.password === undefined ? PASSWORD : init.password;
  if (password !== null) headers["x-app-password"] = password;
  const req = new Request(`https://trendscout.example${path}`, { method: init.method ?? "GET", headers });
  return handler(req, { ip: init.ip ?? ip } as Context);
}

const adapters = adapterMocks as unknown as Record<Platform, { [K in keyof PlatformAdapter]: ReturnType<typeof vi.fn> }>;

beforeEach(() => {
  vi.stubEnv("APP_ACCESS_PASSWORD", PASSWORD);
  vi.stubEnv("SCRAPE_CREATORS_API_KEY", API_KEY);
  vi.stubEnv("RATE_LIMIT_PER_HOUR", "");
  ip = `10.0.0.${++ipCounter}`;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const a of Object.values(adapters)) for (const fn of [a.trending, a.search, a.profile, a.transcript]) fn.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network disabled in tests"))));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetMemoryCaches();
});

async function expectNoSecrets(res: Response) {
  const text = await res.clone().text();
  expect(text).not.toContain(API_KEY);
  expect(text).not.toContain(PASSWORD);
}

describe("auth and method", () => {
  it("session returns ok with the right password", async () => {
    const res = await call(session, "/api/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("401 with a wrong or missing password", async () => {
    for (const password of ["nope", null]) {
      const res = await call(search, "/api/search?platform=tiktok&q=x", { password });
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthorized");
    }
    expect(adapters.tiktok.search).not.toHaveBeenCalled();
  });

  it("500 server_misconfigured when secrets are missing", async () => {
    vi.stubEnv("SCRAPE_CREATORS_API_KEY", "");
    const res = await call(session, "/api/session");
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("server_misconfigured");
    vi.stubEnv("SCRAPE_CREATORS_API_KEY", API_KEY);
    vi.stubEnv("APP_ACCESS_PASSWORD", "");
    expect((await call(trending, "/api/trending?platform=all")).status).toBe(500);
  });

  it("405 for non-GET methods", async () => {
    const res = await call(search, "/api/search?platform=tiktok&q=x", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });

  it("locks out an IP after too many wrong passwords", async () => {
    for (let i = 0; i < 20; i++) expect((await call(session, "/api/session", { password: `bad${i}` })).status).toBe(401);
    const res = await call(session, "/api/session");
    expect(res.status).toBe(429);
  });

  it("session rejects unknown params", async () => {
    expect((await call(session, "/api/session?x=1")).status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("returns 429 after RATE_LIMIT_PER_HOUR requests", async () => {
    vi.stubEnv("RATE_LIMIT_PER_HOUR", "2");
    adapters.tiktok.trending.mockResolvedValue([]);
    expect((await call(trending, "/api/trending?platform=tiktok")).status).toBe(200);
    expect((await call(trending, "/api/trending?platform=tiktok")).status).toBe(200);
    const res = await call(trending, "/api/trending?platform=tiktok");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(adapters.tiktok.trending).toHaveBeenCalledTimes(2);
    // A different IP is unaffected; session/health is not rate limited.
    expect((await call(trending, "/api/trending?platform=tiktok", { ip: "192.0.2.1" })).status).toBe(200);
    expect((await call(session, "/api/session")).status).toBe(200);
  });
});

describe("search", () => {
  it("validates input before calling adapters", async () => {
    const res = await call(search, "/api/search?platform=tiktok&q=x&evil=1");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
    expect((await call(search, "/api/search?platform=tiktok")).status).toBe(400);
    expect(adapters.tiktok.search).not.toHaveBeenCalled();
  });

  it("searches every platform and term, then dedupes, filters, scores and sorts", async () => {
    adapters.tiktok.search.mockImplementation(async (_sc: ScFetch, term: string) =>
      term === "a" ? [video("t1", "tiktok", 50), video("t2", "tiktok", 90)] : [video("t1", "tiktok", 50)],
    );
    adapters.instagram.search.mockResolvedValue([video("i1", "instagram", 70)]);
    adapters.youtube.search.mockResolvedValue([video("y1", "youtube", 5)]);
    const res = await call(search, "/api/search?platform=all&q=a&q=%23b&window=24h&minViews=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(body.videos.map((v: Video) => v.id)).toEqual(["t2", "i1", "t1"]);
    expect(adapters.tiktok.search).toHaveBeenCalledTimes(2);
    expect(adapters.tiktok.search.mock.calls.map((c) => c[1])).toEqual(["a", "#b"]);
    expect(adapters.youtube.search).toHaveBeenCalledTimes(2);
    expect(vi.mocked(scoring.filterVideos).mock.calls[0][1]).toEqual({ window: "24h", minViews: 10 });
  });

  it("returns partial results with per-platform errors in all mode", async () => {
    adapters.tiktok.search.mockResolvedValue([video("t1", "tiktok", 1)]);
    adapters.instagram.search.mockRejectedValue(new ScrapeCreatorsError(500, `boom ${API_KEY}`));
    adapters.youtube.search.mockRejectedValue(new ScrapeCreatorsError(402, "no credits"));
    const res = await call(search, "/api/search?platform=all&q=x");
    expect(res.status).toBe(200);
    await expectNoSecrets(res);
    const body = await res.json();
    expect(body.videos).toHaveLength(1);
    expect(body.errors).toEqual([
      { platform: "instagram", code: "upstream_error", message: expect.any(String) },
      { platform: "youtube", code: "out_of_credits", message: expect.any(String) },
    ]);
    expect(JSON.stringify(body)).not.toContain("boom");
  });

  it("returns the error status when every platform fails, preferring out_of_credits", async () => {
    adapters.tiktok.search.mockRejectedValue(new ScrapeCreatorsError(500, "x"));
    adapters.instagram.search.mockRejectedValue(new ScrapeCreatorsError(402, "x"));
    adapters.youtube.search.mockRejectedValue(new Error("parse failure"));
    const res = await call(search, "/api/search?platform=all&q=x");
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("out_of_credits");
  });

  it("maps a single-platform 402 to out_of_credits", async () => {
    adapters.youtube.search.mockRejectedValue(new ScrapeCreatorsError(402, "x"));
    const res = await call(search, "/api/search?platform=youtube&q=x");
    expect(res.status).toBe(402);
    await expectNoSecrets(res);
  });

  it("caps results at 60", async () => {
    adapters.tiktok.search.mockResolvedValue(Array.from({ length: 80 }, (_, i) => video(`v${i}`, "tiktok", i)));
    const body = await (await call(search, "/api/search?platform=tiktok&q=x")).json();
    expect(body.videos).toHaveLength(60);
  });

  it("passes adapters a Scrape Creators client that sends the key as a header", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    adapters.tiktok.search.mockImplementation(async (sc: ScFetch) => {
      await sc("/v1/tiktok/search/keyword", { query: "x" });
      return [];
    });
    expect((await call(search, "/api/search?platform=tiktok&q=x")).status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).not.toContain(API_KEY);
    expect(new Headers(init.headers).get("x-api-key")).toBe(API_KEY);
  });
});

describe("trending", () => {
  it("calls trending on each platform", async () => {
    adapters.tiktok.trending.mockResolvedValue([video("t", "tiktok", 3)]);
    adapters.instagram.trending.mockResolvedValue([video("i", "instagram", 2)]);
    adapters.youtube.trending.mockResolvedValue([video("y", "youtube", 1)]);
    const body = await (await call(trending, "/api/trending?platform=all")).json();
    expect(body.videos.map((v: Video) => v.id)).toEqual(["t", "i", "y"]);
    expect(vi.mocked(scoring.filterVideos).mock.calls.at(-1)?.[1]).toEqual({ window: "7d", minViews: 0 });
  });

  it("rejects q on trending", async () => {
    expect((await call(trending, "/api/trending?platform=all&q=x")).status).toBe(400);
  });
});

describe("profile-niche", () => {
  it("returns followers, terms and sample size", async () => {
    adapters.instagram.profile.mockResolvedValue({
      handle: "gymrat",
      followers: 1234,
      videos: [video("a", "instagram", 1), video("b", "instagram", 2)],
    });
    const res = await call(profileNiche, "/api/profile-niche?platform=instagram&handle=%40gymrat");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      platform: "instagram",
      handle: "gymrat",
      followers: 1234,
      terms: ["#fitness", "workout"],
      sampleSize: 2,
    });
    expect(adapters.instagram.profile.mock.calls[0][1]).toBe("gymrat");
  });

  it("maps upstream 400/404 to not_found", async () => {
    adapters.tiktok.profile.mockRejectedValue(new ScrapeCreatorsError(400, "x"));
    const res = await call(profileNiche, "/api/profile-niche?platform=tiktok&handle=ghost");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("rejects platform=all and bad handles", async () => {
    expect((await call(profileNiche, "/api/profile-niche?platform=all&handle=x")).status).toBe(400);
    expect((await call(profileNiche, "/api/profile-niche?platform=tiktok&handle=a%2Fb")).status).toBe(400);
  });
});

describe("transcript", () => {
  it("returns the transcript or null", async () => {
    adapters.youtube.transcript.mockResolvedValueOnce("hello world").mockResolvedValueOnce(null);
    const url = encodeURIComponent("https://www.youtube.com/shorts/abc");
    expect(await (await call(transcript, `/api/transcript?platform=youtube&url=${url}`)).json()).toEqual({
      transcript: "hello world",
    });
    expect(await (await call(transcript, `/api/transcript?platform=youtube&url=${url}`)).json()).toEqual({
      transcript: null,
    });
  });

  it("rejects non-platform URLs (no open proxy)", async () => {
    const url = encodeURIComponent("https://169.254.169.254/latest/meta-data");
    expect((await call(transcript, `/api/transcript?platform=youtube&url=${url}`)).status).toBe(400);
    expect(adapters.youtube.transcript).not.toHaveBeenCalled();
  });

  it("maps 402 to out_of_credits and hides unexpected errors", async () => {
    adapters.tiktok.transcript.mockRejectedValueOnce(new ScrapeCreatorsError(402, "x"));
    const url = encodeURIComponent("https://www.tiktok.com/@a/video/1");
    expect((await call(transcript, `/api/transcript?platform=tiktok&url=${url}`)).status).toBe(402);
    adapters.tiktok.transcript.mockRejectedValueOnce(new Error(`stack trace with ${API_KEY}`));
    const res = await call(transcript, `/api/transcript?platform=tiktok&url=${url}`);
    expect(res.status).toBe(502);
    await expectNoSecrets(res);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(API_KEY);
  });
});
