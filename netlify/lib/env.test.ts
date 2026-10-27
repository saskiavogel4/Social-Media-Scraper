import { describe, expect, it } from "vitest";
import { lookalikeKeyNames, scrapeCreatorsKey } from "./env.ts";

const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;

describe("scrapeCreatorsKey", () => {
  it("reads the exact variable", () => {
    expect(scrapeCreatorsKey(env({ SCRAPE_CREATORS_API_KEY: "abc123" }))).toBe("abc123");
  });

  it("forgives spaces, quotes and name casing slips", () => {
    expect(scrapeCreatorsKey(env({ SCRAPE_CREATORS_API_KEY: '  "abc123" ' }))).toBe("abc123");
    expect(scrapeCreatorsKey(env({ " scrape_creators_api_key ": "abc123" }))).toBe("abc123");
    expect(scrapeCreatorsKey(env({ "SCRAPE-CREATORS-API-KEY": "abc123" }))).toBe("abc123");
  });

  it("is empty when missing or blank", () => {
    expect(scrapeCreatorsKey(env({}))).toBe("");
    expect(scrapeCreatorsKey(env({ SCRAPE_CREATORS_API_KEY: "   " }))).toBe("");
  });
});

describe("lookalikeKeyNames", () => {
  it("lists only names that look like the key, never values", () => {
    const names = lookalikeKeyNames(env({ SCRAPECREATORS_KEY: "secret-1", API_KEY: "secret-2", PATH: "/bin", SUPABASE_URL: "x" }));
    expect(names).toEqual(['"SCRAPECREATORS_KEY"', '"API_KEY"']);
    expect(names.join()).not.toContain("secret");
  });
});
