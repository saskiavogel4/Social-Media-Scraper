import { describe, expect, it, vi } from "vitest";
import { checkAuth, passwordMatches } from "./auth.ts";

const env = { APP_ACCESS_PASSWORD: "open sesame", SCRAPE_CREATORS_API_KEY: "k" } as NodeJS.ProcessEnv;
const req = (password?: string) =>
  new Request("http://localhost/api/session", { headers: password === undefined ? {} : { "x-app-password": password } });

describe("auth", () => {
  it("accepts the right password", () => {
    expect(checkAuth(req("open sesame"), env)).toEqual({ ok: true });
  });

  it("rejects wrong, missing, or differently sized passwords", () => {
    for (const p of [undefined, "", "open", "open sesame!", "OPEN SESAME"]) {
      expect(checkAuth(req(p), env)).toEqual({ ok: false, code: "unauthorized" });
    }
  });

  it("is server_misconfigured when either secret is missing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(checkAuth(req("x"), { SCRAPE_CREATORS_API_KEY: "k" } as NodeJS.ProcessEnv)).toEqual({ ok: false, code: "server_misconfigured" });
    expect(checkAuth(req("open sesame"), { APP_ACCESS_PASSWORD: "open sesame" } as NodeJS.ProcessEnv)).toEqual({
      ok: false,
      code: "server_misconfigured",
    });
  });

  it("compares digests of any length", () => {
    expect(passwordMatches("a", "a")).toBe(true);
    expect(passwordMatches("a", "a".repeat(1000))).toBe(false);
  });
});
