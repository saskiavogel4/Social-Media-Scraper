import { describe, expect, it, vi } from "vitest";
import { ScrapeCreatorsError } from "./adapters/types.ts";
import { apiError, mapError, toPlatformError } from "./http.ts";
import { CallBudgetExceededError } from "./rateLimit.ts";

describe("apiError", () => {
  it("uses the status map, friendly messages and no-store", async () => {
    const res = apiError("out_of_credits");
    expect(res.status).toBe(402);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { code: "out_of_credits", message: expect.stringMatching(/credits/i) } });
    expect(apiError("rate_limited").status).toBe(429);
    expect(apiError("server_misconfigured").status).toBe(500);
  });
});

describe("mapError", () => {
  it("maps Scrape Creators statuses", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mapError(new ScrapeCreatorsError(402, "x")).code).toBe("out_of_credits");
    expect(mapError(new ScrapeCreatorsError(404, "x")).code).toBe("not_found");
    expect(mapError(new ScrapeCreatorsError(400, "x")).code).toBe("bad_request");
    expect(mapError(new ScrapeCreatorsError(422, "x"), { lookup: "profile" }).code).toBe("not_found");
    expect(mapError(new ScrapeCreatorsError(500, "x")).code).toBe("upstream_error");
    expect(mapError(new ScrapeCreatorsError(401, "x")).code).toBe("upstream_error");
  });

  it("hides unknown error details from the client but logs them", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapped = mapError(new Error("internal detail at /srv/x.ts"), { platform: "tiktok" });
    expect(mapped.code).toBe("upstream_error");
    expect(mapped.message).not.toContain("internal detail");
    expect(log).toHaveBeenCalled();
  });

  it("builds per-platform errors", () => {
    expect(toPlatformError(new ScrapeCreatorsError(402, "x"), "youtube")).toEqual({
      platform: "youtube",
      code: "out_of_credits",
      message: expect.any(String),
    });
  });
});

describe("call budget", () => {
  it("maps CallBudgetExceededError to rate_limited", () => {
    expect(mapError(new CallBudgetExceededError()).code).toBe("rate_limited");
  });
});
