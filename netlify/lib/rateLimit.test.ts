import { describe, expect, it } from "vitest";
import { MemoryCache } from "./cache.ts";
import { DEFAULT_LIMIT_PER_HOUR, clientIp, consume, hashIp, limitFromEnv, peek } from "./rateLimit.ts";

describe("rate limit", () => {
  it("allows up to the limit per window, then blocks until the next window", async () => {
    let now = 3_600_000 * 10 + 1000;
    const cache = new MemoryCache({ now: () => now });
    const opts = { cache, now: () => now };
    for (let i = 0; i < 3; i++) expect((await consume("api", "1.2.3.4", 3, opts)).allowed).toBe(true);
    const blocked = await consume("api", "1.2.3.4", 3, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(3599);
    // other IPs are independent
    expect((await consume("api", "5.6.7.8", 3, opts)).allowed).toBe(true);
    now += 3_600_000;
    expect((await consume("api", "1.2.3.4", 3, opts)).allowed).toBe(true);
    expect(await peek("api", "1.2.3.4", opts)).toBe(1);
  });

  it("never stores the raw IP", async () => {
    const cache = new MemoryCache();
    const keys: string[] = [];
    const spy = { get: cache.get.bind(cache), set: async (k: string, v: unknown, t: number) => { keys.push(k); await cache.set(k, v, t); } };
    await consume("api", "203.0.113.9", 5, { cache: spy });
    expect(keys[0]).not.toContain("203.0.113.9");
    expect(keys[0]).toContain(hashIp("203.0.113.9"));
  });

  it("reads the limit from RATE_LIMIT_PER_HOUR", () => {
    expect(limitFromEnv({} as NodeJS.ProcessEnv)).toBe(DEFAULT_LIMIT_PER_HOUR);
    expect(limitFromEnv({ RATE_LIMIT_PER_HOUR: "100" } as NodeJS.ProcessEnv)).toBe(100);
    for (const bad of ["0", "-5", "abc", "1e9", ""]) {
      expect(limitFromEnv({ RATE_LIMIT_PER_HOUR: bad } as NodeJS.ProcessEnv)).toBe(DEFAULT_LIMIT_PER_HOUR);
    }
  });

  it("gets the IP from context, then the Netlify header", () => {
    const req = new Request("http://x", { headers: { "x-nf-client-connection-ip": "9.9.9.9" } });
    expect(clientIp(req, { ip: "1.1.1.1" })).toBe("1.1.1.1");
    expect(clientIp(req, null)).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"), null)).toBe("unknown");
  });
});
