import { afterEach, describe, expect, it, vi } from "vitest";
import { bearerToken, checkAuth, clearAuthCache, supabaseSettings } from "./auth.ts";
import { DEFAULT_SUPABASE_PUBLISHABLE_KEY, DEFAULT_SUPABASE_URL } from "../../shared/supabaseConfig.ts";

const env = { SCRAPE_CREATORS_API_KEY: "k" } as NodeJS.ProcessEnv;
const req = (auth?: string) => new Request("https://x/api/session", auth ? { headers: { authorization: auth } } : {});

function supabase(status: number, body: unknown = {}) {
  return vi.fn(async () => (status === 200 ? Response.json(body) : new Response("nope", { status })));
}

afterEach(() => {
  clearAuthCache();
  vi.restoreAllMocks();
});

describe("bearerToken", () => {
  it("reads Bearer tokens only", () => {
    expect(bearerToken(req("Bearer abc.def"))).toBe("abc.def");
    expect(bearerToken(req("bearer abc"))).toBe("abc");
    expect(bearerToken(req("Basic abc"))).toBeUndefined();
    expect(bearerToken(req())).toBeUndefined();
    expect(bearerToken(req(`Bearer ${"x".repeat(5000)}`))).toBeUndefined();
  });
});

describe("checkAuth", () => {
  it("accepts a token Supabase recognises, checking it against the project's /auth/v1/user", async () => {
    const fetchImpl = supabase(200, { id: "user-1", email: "a@b.c" });
    expect(await checkAuth(req("Bearer good"), { env, fetchImpl })).toEqual({ ok: true, userId: "user-1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_SUPABASE_URL}/auth/v1/user`);
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer good");
    expect(headers.get("apikey")).toBe(DEFAULT_SUPABASE_PUBLISHABLE_KEY);
  });

  it("caches valid tokens briefly", async () => {
    const fetchImpl = supabase(200, { id: "user-1" });
    let now = 1_000;
    await checkAuth(req("Bearer good"), { env, fetchImpl, now: () => now });
    await checkAuth(req("Bearer good"), { env, fetchImpl, now: () => now });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 61_000;
    await checkAuth(req("Bearer good"), { env, fetchImpl, now: () => now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects missing, invalid or expired tokens", async () => {
    const fetchImpl = supabase(401);
    expect(await checkAuth(req(), { env, fetchImpl })).toEqual({ ok: false, code: "unauthorized" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await checkAuth(req("Bearer expired"), { env, fetchImpl })).toEqual({ ok: false, code: "unauthorized" });
    expect(await checkAuth(req("Bearer x"), { env, fetchImpl: supabase(200, {}) })).toEqual({ ok: false, code: "unauthorized" });
  });

  it("reports Supabase outages as upstream_error, not as a bad login", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkAuth(req("Bearer t"), { env, fetchImpl: supabase(500) })).toEqual({ ok: false, code: "upstream_error" });
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    expect(await checkAuth(req("Bearer t"), { env, fetchImpl: down })).toEqual({ ok: false, code: "upstream_error" });
  });

  it("is misconfigured without the Scrape Creators key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkAuth(req("Bearer t"), { env: {} as NodeJS.ProcessEnv, fetchImpl: supabase(200, { id: "u" }) })).toEqual({
      ok: false,
      code: "server_misconfigured",
    });
  });

  it("lets env vars point at another Supabase project", () => {
    expect(supabaseSettings({ SUPABASE_URL: "https://other.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" } as NodeJS.ProcessEnv)).toEqual({
      url: "https://other.supabase.co",
      key: "sb_publishable_x",
    });
  });
});
