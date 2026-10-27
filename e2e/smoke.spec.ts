// Smoke tests for the main NextSocialPost flows against the production build.
// All /api/** responses are mocked (see fixtures.ts); the Scrape Creators API is never called.
import { readFile } from "node:fs/promises";
import type { ProfileNicheResponse, TranscriptResponse, VideosResponse } from "../shared/api.ts";
import {
  PASSWORD,
  addTerms,
  apiError,
  cardScores,
  choose,
  createProfileViaUi,
  expect,
  expectNoHorizontalScroll,
  makeVideo,
  test,
} from "./fixtures.ts";

const TERMS_LABEL = "Keywords or hashtags";

/** Five results deliberately NOT in score order, to prove the UI sorts by Trend Score. */
function searchResults(): VideosResponse {
  const scores = [42, 91, 67, 15, 78];
  return { videos: scores.map((trendScore) => makeVideo({ trendScore })), errors: [] };
}

test.describe("password gate", () => {
  test.use({ signedIn: false, seed: { profiles: [] } });

  test("rejects a wrong password, accepts the right one, asks for a profile, and returns to the gate on a later 401", async ({ page, api }) => {
    await page.goto("/");
    const password = page.getByLabel("Access password");
    await expect(password).toBeFocused();

    await password.fill("wrong-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toContainText("Wrong password");
    await expect(password).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Find what's trending in your niche" })).toHaveCount(0);

    await password.fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    // First run: a profile is needed before searching (only the name is required).
    await expect(page.getByLabel("Profile name")).toBeFocused();
    await page.getByRole("button", { name: "Create profile" }).click();
    await expect(page.getByRole("alert")).toContainText("Enter a name for your profile.");
    await createProfileViaUi(page, "Saskia");
    expect(api.callsTo("session").map((c) => c.password)).toEqual(["wrong-password", PASSWORD]);

    // The password changed server-side: the next API call is a 401, which sends the user back to the gate.
    api.on("trending", () => apiError("unauthorized"));
    await page.getByRole("button", { name: "Trending now" }).click();
    await expect(page.getByText("Your session ended. Please enter the access password again.")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("trendscout.password"))).toBeNull();

    // Profiles live on the device, so signing back in goes straight to search.
    await page.getByLabel("Access password").fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Find what's trending in your niche" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Saskia, profile menu" })).toBeVisible();
  });
});

test("niche search with chips renders results sorted by Trend Score", async ({ page, api }) => {
  api.on("search", () => ({ body: searchResults() }));
  await page.goto("/");

  await addTerms(page, TERMS_LABEL, ["meal prep", "#booktok"]);
  const chips = page.getByRole("list", { name: "Selected terms" }).getByRole("listitem");
  await expect(chips).toHaveText(["meal prep", "#booktok"]);
  await page.getByRole("button", { name: "Remove #booktok" }).click();
  await addTerms(page, TERMS_LABEL, ["#mealprep"]);
  await expect(chips).toHaveText(["meal prep", "#mealprep"]);

  await page.getByRole("button", { name: "Find trends" }).click();
  await expect(page.getByRole("heading", { name: "meal prep, #mealprep on TikTok" })).toBeVisible();
  await expect(page.getByText("5 videos found")).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(5);
  expect(await cardScores(page)).toEqual([91, 78, 67, 42, 15]);

  const [call] = api.callsTo("search");
  expect(call.params.get("platform")).toBe("tiktok");
  expect(call.params.getAll("q")).toEqual(["meal prep", "#mealprep"]);
  expect(call.params.get("window")).toBe("7d");
  expect(call.params.get("minViews")).toBe("0");

  // Other sorts work too: views are 100K * creation order, so Views sorts by that.
  await page.getByLabel("Sort by").selectOption("views");
  expect(await cardScores(page)).toEqual([78, 15, 67, 91, 42]);
});

test("shows a partial-failure notice when some platforms fail in All mode", async ({ page, api }) => {
  api.on("search", () => ({
    body: {
      videos: [makeVideo({ platform: "tiktok", trendScore: 80 }), makeVideo({ platform: "tiktok", trendScore: 60 })],
      errors: [
        { platform: "instagram", code: "out_of_credits", message: "Out of credits" },
        { platform: "youtube", code: "upstream_error", message: "Upstream error" },
      ],
    } satisfies VideosResponse,
  }));
  await page.goto("/");
  await choose(page, "All");
  await addTerms(page, TERMS_LABEL, ["sourdough"]);
  await page.getByRole("button", { name: "Find trends" }).click();

  const notice = page.getByRole("status").filter({ hasText: "Some platforms couldn't be searched" });
  await expect(notice).toContainText("Instagram: out of API credits.");
  await expect(notice).toContainText("YouTube Shorts: the platform didn't respond.");
  await expect(page.locator("main article")).toHaveCount(2);
  expect(api.callsTo("search")[0].params.get("platform")).toBe("all");

  await notice.getByRole("button", { name: "Dismiss notice" }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator("main article")).toHaveCount(2);
});

test("detail drawer loads a transcript on demand and closes with Escape", async ({ page, api }) => {
  api.on("search", () => ({ body: searchResults() }));
  api.on("transcript", () => ({ body: { transcript: "Here's how I prep five lunches in 20 minutes." } satisfies TranscriptResponse }));
  await page.goto("/");
  await addTerms(page, TERMS_LABEL, ["meal prep"]);
  await page.getByRole("button", { name: "Find trends" }).click();

  const firstCard = page.locator("main article").first();
  const openButton = firstCard.locator("h3 button");
  await openButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close details" })).toBeFocused();
  await expect(dialog.getByRole("link", { name: /Open on TikTok/ })).toHaveAttribute("rel", "noopener noreferrer");
  expect(api.callsTo("transcript")).toHaveLength(0); // never fetched until asked (credits)

  await dialog.getByRole("button", { name: "Load transcript" }).click();
  await expect(dialog.getByLabel("Transcript text")).toHaveText("Here's how I prep five lunches in 20 minutes.");
  const [call] = api.callsTo("transcript");
  expect(call.params.get("platform")).toBe("tiktok");
  expect(call.params.get("url")).toMatch(/^https:\/\/www\.tiktok\.com\/@creator\d+\/video\/vid\d+$/);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(openButton).toBeFocused();
});

test("saving a video shows it in Saved ideas and exports CSV", async ({ page, api }) => {
  api.on("search", () => ({ body: searchResults() }));
  await page.goto("/");
  await addTerms(page, TERMS_LABEL, ["meal prep"]);
  await page.getByRole("button", { name: "Find trends" }).click();

  const top = page.locator("main article").first();
  const caption = await top.locator("h3 button").innerText();
  await top.getByRole("button", { name: "Save idea" }).click();
  await expect(top.getByRole("button", { name: "Remove from saved ideas" })).toBeVisible();

  const savedTab = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^Saved/ });
  await expect(savedTab).toContainText("1");
  await savedTab.click();
  await expect(page.getByRole("heading", { name: "Saved ideas" })).toBeVisible();
  await expect(page.getByText("1 video saved in this browser.")).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(page.locator("main article h3 button")).toHaveText(caption);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^nextsocialpost-saved-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = (await readFile(await download.path(), "utf8")).replace(/^\uFEFF/, "");
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe("platform,url,caption,handle,views,likes,comments,shares,trendScore,postedAt");
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain(caption);
  expect(lines[1]).toContain(",91,");

  // Saved ideas survive a reload (localStorage).
  await page.reload();
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^Saved/ }).click();
  await expect(page.locator("main article")).toHaveCount(1);
});

test("account mode suggests niche terms from a handle, then finds trends", async ({ page, api }) => {
  api.on("profile-niche", () => ({
    body: {
      platform: "instagram",
      handle: "fitcoach",
      followers: 12_500,
      terms: ["#homeworkout", "kettlebell", "#mobility"],
      sampleSize: 24,
    } satisfies ProfileNicheResponse,
  }));
  api.on("search", () => ({ body: searchResults() }));
  await page.goto("/");

  await choose(page, "Instagram");
  await choose(page, "My account");
  await expect(page.getByRole("radio", { name: "All", exact: true })).toBeDisabled();
  const handle = page.getByLabel("Your Instagram handle");
  await handle.fill("@fitcoach");
  await expect(handle).toHaveValue("fitcoach");
  await page.getByRole("button", { name: "Analyse account" }).click();

  await expect(page.getByText("based on 24 recent posts")).toBeVisible();
  await expect(page.getByText("12.5K followers")).toBeVisible();
  const chips = page.getByRole("list", { name: "Selected terms" }).getByRole("listitem");
  await expect(chips).toHaveText(["#homeworkout", "kettlebell", "#mobility"]);
  expect(api.callsTo("profile-niche")[0].params.get("handle")).toBe("fitcoach");
  expect(api.callsTo("profile-niche")[0].params.get("platform")).toBe("instagram");

  // The user edits a suggestion before searching.
  await page.getByRole("button", { name: "Remove kettlebell" }).click();
  await page.getByRole("button", { name: "Find trends" }).click();
  await expect(page.locator("main article")).toHaveCount(5);
  const [call] = api.callsTo("search");
  expect(call.params.get("platform")).toBe("instagram");
  expect(call.params.getAll("q")).toEqual(["#homeworkout", "#mobility"]);
});

test("account mode shows a friendly error for an unknown profile", async ({ page, api }) => {
  api.on("profile-niche", () => apiError("not_found"));
  await page.goto("/");
  await choose(page, "My account");
  await page.getByLabel("Your TikTok handle").fill("nobody_here");
  await page.getByRole("button", { name: "Analyse account" }).click();
  await expect(page.getByRole("alert")).toContainText("Profile not found or private");
});

test("out of credits shows a clear error and Try again recovers", async ({ page, api }) => {
  let attempts = 0;
  api.on("search", () => (++attempts === 1 ? apiError("out_of_credits") : { body: searchResults() }));
  await page.goto("/");
  await addTerms(page, TERMS_LABEL, ["meal prep"]);
  await page.getByRole("button", { name: "Find trends" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Out of API credits");
  await expect(alert).toContainText("Top up the Scrape Creators account");
  await expect(page.locator("main article")).toHaveCount(0);

  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("main article")).toHaveCount(5);
  expect(api.callsTo("search")).toHaveLength(2);
});

test.describe("at 360px wide", () => {
  test.use({ viewport: { width: 360, height: 780 }, signedIn: false, seed: { profiles: [] } });

  test("no view scrolls horizontally", async ({ page, api }) => {
    const longHandle = "a_really_long_creator_handle_without_any_breaks_1234567890";
    const longCaption = `Unbroken${"x".repeat(120)} https://example.com/${"y".repeat(80)} #${"z".repeat(60)}`;
    api.on("search", () => ({
      body: {
        videos: [
          makeVideo({ caption: longCaption, author: { handle: longHandle, displayName: longCaption.slice(0, 90) } }),
          makeVideo({ platform: "youtube", hashtags: ["a".repeat(55), "b".repeat(55)] }),
          makeVideo({ platform: "instagram", stats: { likes: 1_234_567_890, comments: 98_765_432 } }),
        ],
        errors: [{ platform: "instagram", code: "rate_limited", message: "Too many requests" }],
      } satisfies VideosResponse,
    }));
    api.on("profile-niche", () => ({
      body: { platform: "tiktok", handle: longHandle, followers: 1_234_567, terms: ["#a", "b"], sampleSize: 30 },
    }));

    await page.goto("/");
    await expectNoHorizontalScroll(page, "password gate");
    await page.getByLabel("Access password").fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
    for (const section of ["Your content", "Look and feel", "Search defaults"]) {
      await page.locator("summary").filter({ hasText: section }).click();
    }
    await expectNoHorizontalScroll(page, "create profile (all sections open)");
    await createProfileViaUi(page, "A very long profile name that fills forty");
    await expectNoHorizontalScroll(page, "search form");

    await page.getByRole("button", { name: /profile menu$/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoHorizontalScroll(page, "profile menu");
    await page.getByRole("menuitem", { name: "Edit profile" }).click();
    await expect(page.getByRole("heading", { name: "Edit profile" })).toBeVisible();
    await expectNoHorizontalScroll(page, "edit profile");
    await page.getByRole("button", { name: "Cancel" }).click();

    await addTerms(page, TERMS_LABEL, ["#averyveryverylonghashtagthatgoesonandon", "meal prep", "#booktok", "high protein", "#x"]);
    await expectNoHorizontalScroll(page, "search form with 5 chips");

    await choose(page, "My account");
    await page.getByLabel("Your TikTok handle").fill(longHandle);
    await page.getByRole("button", { name: "Analyse account" }).click();
    await expect(page.getByText("based on 30 recent posts")).toBeVisible();
    await expectNoHorizontalScroll(page, "account mode");

    await choose(page, "My niche");
    await choose(page, "All");
    await page.getByRole("button", { name: "Find trends" }).click();
    await expect(page.locator("main article")).toHaveCount(3);
    await expectNoHorizontalScroll(page, "results with partial-failure notice");

    await page.locator("main article").first().locator("h3 button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalScroll(page, "detail drawer");
    await page.keyboard.press("Escape");

    await page.locator("main article").nth(1).getByRole("button", { name: "Save idea" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^Saved/ }).click();
    await expect(page.getByRole("heading", { name: "Saved ideas" })).toBeVisible();
    await expectNoHorizontalScroll(page, "saved ideas");
  });
});
