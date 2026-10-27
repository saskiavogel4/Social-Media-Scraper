// Profiles: first run, search defaults, look and feel, per-profile saved ideas, switching and deleting.
// Profiles live only in localStorage; all /api/** responses are mocked (see fixtures.ts).
import type { Page } from "@playwright/test";
import type { VideosResponse } from "../shared/api.ts";
import type { Profile } from "../src/lib/profiles.ts";
import {
  DEFAULT_PROFILE,
  addTerms,
  choose,
  createProfileViaUi,
  expect,
  expectNoHorizontalScroll,
  makeVideo,
  openProfileMenu,
  test,
} from "./fixtures.ts";

const SEARCH_HEADING = "Find what's trending in your niche";

function results(n = 6): VideosResponse {
  return { videos: Array.from({ length: n }, (_, i) => makeVideo({ trendScore: 90 - i })), errors: [] };
}

const savedTab = (page: Page) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^Saved/ });

async function findTrends(page: Page, term = "meal prep") {
  await addTerms(page, "Keywords or hashtags", [term]);
  await page.getByRole("button", { name: "Find trends" }).click();
  await expect(page.locator("main article").first()).toBeVisible();
}

async function editProfile(page: Page) {
  await openProfileMenu(page);
  await page.getByRole("menuitem", { name: "Edit profile" }).click();
  await expect(page.getByRole("heading", { name: "Edit profile" })).toBeFocused();
}

/** Number of columns the results grid currently renders. */
const gridColumns = (page: Page) =>
  page.locator("main ul[data-density]").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

/** Resolves a CSS colour expression to the browser's computed value, for comparing against real elements. */
const resolveColor = (page: Page, expr: string) =>
  page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = value; // CSSOM, allowed by the CSP (unlike inline style attributes)
    document.body.append(probe);
    const out = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return out;
  }, expr);

const bg = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("first run", () => {
  test.use({ seed: { profiles: [] } });

  test("creating a profile pre-fills the search form with its platform, niche, handle and defaults", async ({ page, api }) => {
    api.on("search", () => ({ body: results() }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
    await expect(page.getByText("Saved on this device only", { exact: false }).first()).toBeVisible();

    await page.getByLabel("Profile name").fill("Fit Coach");
    await page.getByRole("radio", { name: "Flexed arm" }).check({ force: true });

    await page.locator("summary").filter({ hasText: "Your content" }).click();
    await choose(page, "Instagram");
    await page.getByLabel("Your handle (optional)").fill("@fitcoach");
    await addTerms(page, "Niche keywords or hashtags", ["#homeworkout", "kettlebell 💪", "#HomeWorkout"]);

    await page.locator("summary").filter({ hasText: "Search defaults" }).click();
    await page.getByLabel("Sort results by").selectOption("views");
    await page.getByLabel("Posted within").selectOption("30d");
    await page.getByLabel("Minimum views").selectOption("100000");
    await page.getByRole("button", { name: "Create profile" }).click();

    await expect(page.getByRole("heading", { name: SEARCH_HEADING })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fit Coach, profile menu" })).toContainText("💪");
    await expect(page.getByRole("radio", { name: "Instagram", exact: true })).toBeChecked();
    const chips = page.getByRole("list", { name: "Selected terms" }).getByRole("listitem");
    await expect(chips).toHaveText(["#homeworkout", "kettlebell"]); // sanitised like search chips, deduped
    await expect(page.getByLabel("Posted within")).toHaveValue("30d");
    await expect(page.getByLabel("Minimum views")).toHaveValue("100000");

    await choose(page, "My account");
    await expect(page.getByLabel("Your Instagram handle")).toHaveValue("fitcoach");
    await choose(page, "My niche");

    await page.getByRole("button", { name: "Find trends" }).click();
    await expect(page.locator("main article")).toHaveCount(6);
    await expect(page.getByLabel("Sort by")).toHaveValue("views");
    const [call] = api.callsTo("search");
    expect(call.params.get("platform")).toBe("instagram");
    expect(call.params.getAll("q")).toEqual(["#homeworkout", "kettlebell"]);
    expect(call.params.get("window")).toBe("30d");
    expect(call.params.get("minViews")).toBe("100000");

    // The user can still change anything for a single search.
    await choose(page, "TikTok");
    await page.getByLabel("Posted within").selectOption("24h");
    await page.getByRole("button", { name: "Find trends" }).click();
    await expect.poll(() => api.callsTo("search").length).toBe(2);
    expect(api.callsTo("search")[1].params.get("platform")).toBe("tiktok");
    expect(api.callsTo("search")[1].params.get("window")).toBe("24h");
  });

  test("ideas saved before profiles existed move into the first profile", async ({ page }) => {
    const legacy = [makeVideo({ caption: "Saved before profiles" })];
    await page.addInitScript((list) => {
      if (!sessionStorage.getItem("e2e.legacy")) {
        sessionStorage.setItem("e2e.legacy", "1");
        localStorage.setItem("trendscout.saved", JSON.stringify(list));
      }
    }, legacy);
    await page.goto("/");
    await createProfileViaUi(page, "Migrated");
    await expect(savedTab(page)).toContainText("1");
    await savedTab(page).click();
    await expect(page.locator("main article h3 button")).toHaveText("Saved before profiles");
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("trendscout.saved")));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^trendscout\.saved\.[\w-]+$/);
  });
});

test("dark theme and a different accent apply instantly, persist, and Cancel reverts the preview", async ({ page, api }) => {
  api.on("search", () => ({ body: results() }));
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "system");
  await expect(html).toHaveAttribute("data-accent", "violet");
  const violet = await bg(page, "Find trends");
  expect(violet).toBe(await resolveColor(page, "oklch(49.1% 0.27 292.581)")); // Tailwind violet-700
  const lightBody = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await editProfile(page);
  await choose(page, "Dark");
  await choose(page, "Emerald");
  // Live preview before saving.
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveAttribute("data-accent", "emerald");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { name: SEARCH_HEADING })).toBeVisible();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const darkBody = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBody).toBe(await resolveColor(page, "var(--color-slate-950)"));
  expect(darkBody).not.toBe(lightBody);
  expect(await bg(page, "Find trends")).toBe(await resolveColor(page, "var(--color-emerald-700)"));

  // Chips, the Trend Score badge and the active tab follow the accent too.
  await findTrends(page);
  await expect(page.locator("main article [title^='Trend Score']").first()).toHaveCSS("background-color", await resolveColor(page, "var(--color-emerald-700)"));

  // Applied before React renders on the next load.
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveAttribute("data-accent", "emerald");

  // Cancel throws the preview away.
  await editProfile(page);
  await choose(page, "Rose");
  await choose(page, "Light");
  await expect(html).toHaveAttribute("data-accent", "rose");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(html).toHaveAttribute("data-accent", "emerald");
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test.describe("theme follows the device unless overridden", () => {
  test.use({ colorScheme: "dark" });

  test("system follows the OS dark mode; light overrides it", async ({ page }) => {
    await page.goto("/");
    const darkBody = await resolveColor(page, "var(--color-slate-950)");
    const lightBody = await resolveColor(page, "var(--color-slate-50)");
    await expect(page.locator("body")).toHaveCSS("background-color", darkBody);

    await editProfile(page);
    await choose(page, "Light");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", lightBody);
  });
});

test.describe("density", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("compact adds a grid column and shrinks card text", async ({ page, api }) => {
    api.on("search", () => ({ body: results(10) }));
    await page.goto("/");
    await findTrends(page);
    expect(await gridColumns(page)).toBe(4);
    const caption = page.locator("main article h3").first();
    await expect(caption).toHaveCSS("font-size", "14px");

    await editProfile(page);
    await choose(page, "Compact");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("button", { name: "Find trends" }).click();
    await expect(page.locator("main article").first()).toBeVisible();
    expect(await gridColumns(page)).toBe(5);
    await expect(caption).toHaveCSS("font-size", "12px");
  });
});

test.describe("compact at 360px", () => {
  test.use({
    viewport: { width: 360, height: 780 },
    seed: { profiles: [{ ...DEFAULT_PROFILE, density: "compact", theme: "dark", accent: "amber" }] },
  });

  test("two columns and no horizontal scroll", async ({ page, api }) => {
    api.on("search", () => ({
      body: { videos: [makeVideo({ stats: { views: 1_234_567_890, likes: 98_765_432, comments: 1_234_567, shares: 7_654_321 } }), makeVideo(), makeVideo()], errors: [] },
    }));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "amber");
    await findTrends(page);
    expect(await gridColumns(page)).toBe(2);
    await expectNoHorizontalScroll(page, "compact results");
  });
});

test("each profile keeps its own saved ideas, and switching restores them", async ({ page, api }) => {
  api.on("search", () => ({ body: results() }));
  await page.goto("/");
  await findTrends(page);
  await page.locator("main article").first().getByRole("button", { name: "Save idea" }).click();
  await expect(savedTab(page)).toContainText("1");

  await openProfileMenu(page);
  await page.getByRole("menuitem", { name: "New profile" }).click();
  await expect(page.getByRole("heading", { name: "New profile" })).toBeVisible();
  await expect(page.getByLabel("Profile name")).toBeFocused();
  await page.getByLabel("Profile name").fill("Second Channel");
  await page.getByRole("button", { name: "Create profile" }).click();

  await expect(page.getByRole("button", { name: "Second Channel, profile menu" })).toBeVisible();
  await expect(savedTab(page)).toContainText("0");
  await findTrends(page, "sourdough");
  const articles = page.locator("main article");
  await articles.nth(1).getByRole("button", { name: "Save idea" }).click();
  await articles.nth(2).getByRole("button", { name: "Save idea" }).click();
  await expect(savedTab(page)).toContainText("2");

  await openProfileMenu(page);
  const switchTo = page.getByRole("menuitemradio", { name: DEFAULT_PROFILE.name });
  await expect(page.getByRole("menuitemradio", { name: "Second Channel" })).toHaveAttribute("aria-checked", "true");
  await switchTo.click();
  await expect(page.getByRole("button", { name: `${DEFAULT_PROFILE.name}, profile menu` })).toBeFocused();
  await expect(savedTab(page)).toContainText("1");
  await savedTab(page).click();
  await expect(page.locator("main article")).toHaveCount(1);

  // Survives a reload with the switched-to profile still active.
  await page.reload();
  await expect(page.getByRole("button", { name: `${DEFAULT_PROFILE.name}, profile menu` })).toBeVisible();
  await expect(savedTab(page)).toContainText("1");
});

test.describe("deleting", () => {
  const second: Profile = { ...DEFAULT_PROFILE, id: "e2e-second", name: "Second", avatar: "🍳" };
  test.use({ seed: { profiles: [DEFAULT_PROFILE, second] } });

  test("the profile menu is keyboard accessible and delete asks first; deleting the last profile returns to setup", async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("e2e.saved")) {
        sessionStorage.setItem("e2e.saved", "1");
        localStorage.setItem("trendscout.saved.e2e-default", "[]");
      }
    });
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: `${DEFAULT_PROFILE.name}, profile menu` });

    // Keyboard: Enter opens and focuses the first item, arrows move, Esc closes and returns focus.
    await menuButton.focus();
    await page.keyboard.press("Enter");
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menuitem", { name: "Edit profile" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitemradio", { name: DEFAULT_PROFILE.name })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Delete profile" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Edit profile" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    // Delete, but cancel first.
    await openProfileMenu(page);
    await page.getByRole("menuitem", { name: "Delete profile" }).click();
    const dialog = page.getByRole("alertdialog", { name: `Delete "${DEFAULT_PROFILE.name}"?` });
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(menuButton).toBeVisible();

    await openProfileMenu(page);
    await page.getByRole("menuitem", { name: "Delete profile" }).click();
    await dialog.getByRole("button", { name: "Delete profile" }).click();
    await expect(page.getByRole("button", { name: "Second, profile menu" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("trendscout.saved.e2e-default"))).toBeNull();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("trendscout.profiles") ?? "[]") as Profile[]);
    expect(stored.map((p) => p.id)).toEqual(["e2e-second"]);

    // Deleting the last profile goes back to the create screen.
    await openProfileMenu(page);
    await expect(page.getByRole("menuitemradio")).toHaveCount(0); // no switch list with one profile
    await page.getByRole("menuitem", { name: "Delete profile" }).click();
    const last = page.getByRole("alertdialog", { name: 'Delete "Second"?' });
    await expect(last).toContainText("You'll be asked to create a new profile next.");
    await last.getByRole("button", { name: "Delete profile" }).click();
    await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
    await createProfileViaUi(page, "Fresh start");
  });
});
