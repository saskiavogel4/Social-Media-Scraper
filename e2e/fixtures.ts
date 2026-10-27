// Playwright fixtures for the smoke tests.
// - Every /api/** request is answered by MockApi (never the real Netlify Functions or Scrape Creators).
// - Each request's query string is checked with the server's own validators, so a param
//   mismatch between src/api.ts and netlify/functions fails the test.
// - Any other cross-origin request (thumbnails) gets a local 1x1 PNG; nothing leaves the machine.
// - The production Content-Security-Policy from netlify.toml is applied to the page, and CSP
//   violations, uncaught page errors and console errors fail the test.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page, type Route } from "@playwright/test";
import type { ApiErrorBody, ApiErrorCode } from "../shared/api.ts";
import type { Platform, Video } from "../shared/types.ts";
import type { Profile } from "../src/lib/profiles.ts";
import {
  ValidationError,
  parseEmptyQuery,
  parseProfileNicheQuery,
  parseSearchQuery,
  parseTranscriptQuery,
  parseTrendingQuery,
} from "../netlify/lib/validate.ts";

export const PASSWORD = "open-sesame";

/** The profile most tests start with: the app's defaults, so the search form looks exactly as before profiles. */
export const DEFAULT_PROFILE: Profile = {
  id: "e2e-default",
  name: "Test Creator",
  avatar: "🎬",
  createdAt: "2026-10-01T00:00:00.000Z",
  primaryPlatform: "tiktok",
  nicheTerms: [],
  theme: "system",
  accent: "violet",
  density: "comfortable",
  defaultSort: "trend",
  defaultWindow: "7d",
  defaultMinViews: 0,
};

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  rate_limited: 429,
  out_of_credits: 402,
  not_found: 404,
  bad_request: 400,
  upstream_error: 502,
  server_misconfigured: 500,
};

/** 1x1 transparent PNG used for every external image. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** The exact CSP shipped in netlify.toml. */
export const PRODUCTION_CSP = (() => {
  const toml = readFileSync(fileURLToPath(new URL("../netlify.toml", import.meta.url)), "utf8");
  const match = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(toml);
  if (!match) throw new Error("netlify.toml has no Content-Security-Policy header");
  return match[1];
})();

type Endpoint = "session" | "search" | "trending" | "profile-niche" | "transcript";

const VALIDATORS: Record<Endpoint, (params: URLSearchParams) => unknown> = {
  session: parseEmptyQuery,
  search: parseSearchQuery,
  trending: parseTrendingQuery,
  "profile-niche": parseProfileNicheQuery,
  transcript: parseTranscriptQuery,
};

export interface ApiCall {
  endpoint: Endpoint;
  params: URLSearchParams;
  password: string | null;
}

export interface MockReply {
  status?: number;
  body: unknown;
}

type Handler = (call: ApiCall) => MockReply | Promise<MockReply>;

export function apiError(code: ApiErrorCode, message = `Mock ${code}`): MockReply {
  const body: ApiErrorBody = { error: { code, message } };
  return { status: STATUS[code], body };
}

export class MockApi {
  readonly calls: ApiCall[] = [];
  /** Requests the real server would reject or that no test expected. Must stay empty. */
  readonly problems: string[] = [];
  private readonly handlers = new Map<Endpoint, Handler>();

  constructor() {
    // Mirrors netlify/functions/session.ts: 200 only for the right password.
    this.on("session", (call) => (call.password === PASSWORD ? { body: { ok: true } } : apiError("unauthorized")));
  }

  on(endpoint: Endpoint, handler: Handler): this {
    this.handlers.set(endpoint, handler);
    return this;
  }

  callsTo(endpoint: Endpoint): ApiCall[] {
    return this.calls.filter((c) => c.endpoint === endpoint);
  }

  async handle(route: Route, url: URL): Promise<void> {
    const endpoint = url.pathname.replace(/^\/api\//, "") as Endpoint;
    const request = route.request();
    const call: ApiCall = { endpoint, params: url.searchParams, password: request.headers()["x-app-password"] ?? null };
    this.calls.push(call);

    let reply: MockReply;
    const validate = VALIDATORS[endpoint];
    if (request.method() !== "GET") {
      this.problems.push(`${request.method()} ${url.pathname} (API is GET-only)`);
      reply = apiError("bad_request");
    } else if (!validate) {
      this.problems.push(`Unknown endpoint ${url.pathname}`);
      reply = apiError("not_found");
    } else if (endpoint !== "session" && call.password !== PASSWORD) {
      reply = apiError("unauthorized");
    } else {
      try {
        validate(url.searchParams);
        const handler = this.handlers.get(endpoint);
        if (handler) {
          reply = await handler(call);
        } else {
          this.problems.push(`Unmocked call to ${url.pathname}${url.search}`);
          reply = apiError("upstream_error");
        }
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        this.problems.push(`Server would reject ${url.pathname}${url.search}: ${err.message}`);
        reply = apiError("bad_request", err.message);
      }
    }
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(reply.body),
    });
  }
}

interface Fixtures {
  api: MockApi;
  /** Pre-fills the stored password so the app opens past the gate. Default true. */
  signedIn: boolean;
  /**
   * Profiles stored before the page loads (first one active). Default: one profile with the app defaults.
   * `{ profiles: [] }` = first run. (An object, because Playwright reads array option values as [value, options].)
   */
  seed: { profiles: Profile[] };
}

export const test = base.extend<Fixtures>({
  signedIn: [true, { option: true }],
  seed: [{ profiles: [DEFAULT_PROFILE] }, { option: true }],

  // Auto: every test gets the mocked API, seeded storage and the CSP/page-error checks, even if it never uses `api`.
  api: [
    async ({ page, signedIn, seed, baseURL }, provide) => {
      const api = new MockApi();
      const origin = new URL(baseURL!).origin;
      const pageErrors: string[] = [];
      const externalHosts = new Set<string>();

      page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        // Mocked 4xx/5xx API responses are logged by Chromium as "Failed to load resource"; those are expected.
        if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) {
          pageErrors.push(`console.error: ${msg.text()}`);
        }
      });

      await page.addInitScript(
        ({ password, signedIn, profiles }) => {
          const w = window as unknown as { __cspViolations: string[] };
          w.__cspViolations = [];
          document.addEventListener("securitypolicyviolation", (e) => {
            w.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
          });
          // Only seed once per test, so sign-out and 401 flows behave like a real browser.
          if (signedIn && !sessionStorage.getItem("e2e.seeded")) {
            sessionStorage.setItem("e2e.seeded", "1");
            localStorage.setItem("trendscout.password", password);
          }
          if (profiles.length > 0 && !sessionStorage.getItem("e2e.profilesSeeded")) {
            sessionStorage.setItem("e2e.profilesSeeded", "1");
            localStorage.setItem("trendscout.profiles", JSON.stringify(profiles));
            localStorage.setItem("trendscout.activeProfile", profiles[0].id);
          }
        },
        { password: PASSWORD, signedIn, profiles: seed.profiles },
      );

      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
          externalHosts.add(url.host);
          if (route.request().resourceType() === "image") {
            await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
          } else {
            await route.abort("blockedbyclient");
          }
          return;
        }
        if (url.pathname.startsWith("/api/")) return api.handle(route, url);
        if (route.request().resourceType() === "document") {
          const response = await route.fetch();
          await route.fulfill({
            response,
            headers: { ...response.headers(), "content-security-policy": PRODUCTION_CSP },
          });
          return;
        }
        await route.continue();
      });

      await provide(api);

      const csp = await page
        .evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])
        .catch(() => [] as string[]);
      expect(csp, "CSP violations").toEqual([]);
      expect(pageErrors, "page errors").toEqual([]);
      expect(api.problems, "API contract problems").toEqual([]);
      for (const host of externalHosts) expect(host).not.toContain("scrapecreators");
    },
    { auto: true },
  ],
});

export { expect };

let seq = 0;
const HOUR = 3_600_000;

/** A normalised Video as the API returns it. */
export function makeVideo(overrides: Partial<Video> & { platform?: Platform } = {}): Video {
  seq += 1;
  const platform = overrides.platform ?? "tiktok";
  const id = overrides.id ?? `vid${seq}`;
  const url =
    platform === "tiktok"
      ? `https://www.tiktok.com/@creator${seq}/video/${id}`
      : platform === "instagram"
        ? `https://www.instagram.com/reel/${id}/`
        : `https://www.youtube.com/shorts/${id}`;
  return {
    id,
    platform,
    url,
    thumbnailUrl: `https://thumbs.example.com/${id}.jpg`,
    caption: `Video ${seq} caption #mealprep`,
    hashtags: ["mealprep", "highprotein"],
    author: { handle: `creator${seq}`, displayName: `Creator ${seq}`, followers: 10_000 },
    stats: { views: 100_000 * seq, likes: 5_000, comments: 200, shares: 100 },
    postedAt: new Date(Date.now() - seq * 5 * HOUR).toISOString(),
    durationSec: 31,
    soundName: "original sound",
    trendScore: 50,
    ...overrides,
  };
}

/** Clicks a segmented-control option (a visually hidden radio inside a label). */
export async function choose(page: Page, label: string): Promise<void> {
  await page.locator("fieldset label").filter({ hasText: new RegExp(`^${label}$`) }).click();
  await expect(page.getByRole("radio", { name: label, exact: true })).toBeChecked();
}

/** Completes the first-run "Create your profile" screen with just a name (the fast path). */
export async function createProfileViaUi(page: Page, name = "Test Creator"): Promise<void> {
  await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Find what's trending in your niche" })).toBeVisible();
}

/** Opens the header profile menu. */
export async function openProfileMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /profile menu$/ }).click();
  await expect(page.getByRole("menu", { name: "Profile" })).toBeVisible();
}

/** Adds chips by typing each term and pressing Enter. */
export async function addTerms(page: Page, label: string, terms: string[]): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  for (const term of terms) {
    await input.fill(term);
    await input.press("Enter");
  }
}

/** Trend Score badges of the result cards, in on-screen order. */
export async function cardScores(page: Page): Promise<number[]> {
  const texts = await page.locator("main article [title^='Trend Score']").allInnerTexts();
  return texts.map((t) => Number(t.replace(/\D+/g, "")));
}

export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 0.5)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    return { scroll: doc.scrollWidth - doc.clientWidth, offenders };
  });
  expect(overflow.scroll, `horizontal overflow at ${where}: ${overflow.offenders.join(", ")}`).toBeLessThanOrEqual(0);
}
