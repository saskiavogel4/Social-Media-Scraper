import { describe, expect, it } from "vitest";
import type { Video } from "./types.ts";
import { extractNicheTerms, isNoiseTag, termKey, termsFromPost } from "./niche.ts";

let n = 0;
function post(caption: string, hashtags: string[] = [], views?: number): Video {
  n += 1;
  return {
    id: String(n),
    platform: "tiktok",
    url: "",
    thumbnailUrl: "",
    caption,
    hashtags,
    author: { handle: "me" },
    stats: views === undefined ? {} : { views },
    trendScore: 0,
  };
}

describe("termsFromPost", () => {
  it("collects hashtags from the field and the caption, lowercased, without noise", () => {
    const t = termsFromPost(post("Sunday #MealPrep #fyp #viral", ["HighProtein", "#fyp", "reels"]));
    expect([...t.hashtags].sort()).toEqual(["#highprotein", "#mealprep"]);
  });

  it("drops mentions, URLs, numbers, emoji and stopwords from caption words", () => {
    const t = termsFromPost(
      post("🔥 5 easy chicken recipes with @chefjoe 2024 https://x.co/abc www.site.com 🍗"),
    );
    expect([...t.words].sort()).toEqual(["chicken", "easy", "recipes"]);
    expect(t.bigrams.has("chicken recipes")).toBe(true);
    expect(t.bigrams.has("easy chicken")).toBe(true);
  });

  it("does not build phrases across punctuation, emoji or removed hashtags", () => {
    const t = termsFromPost(post("meal prep. chicken 🔥 rice #tag salmon"));
    expect(t.bigrams.has("meal prep")).toBe(true);
    expect(t.bigrams.has("prep chicken")).toBe(false);
    expect(t.bigrams.has("chicken rice")).toBe(false);
    expect(t.bigrams.has("rice salmon")).toBe(false);
  });

  it("joins hyphenated words and strips apostrophes", () => {
    const t = termsFromPost(post("meal-prep don't skip"));
    expect(t.bigrams.has("meal prep")).toBe(true);
    expect(t.words.has("dont")).toBe(false);
  });

  it("drops all-number hashtags but keeps alphanumeric ones", () => {
    const t = termsFromPost(post("#2024 #100daysofcode"));
    expect([...t.hashtags]).toEqual(["#100daysofcode"]);
  });
});

describe("isNoiseTag / termKey", () => {
  it("flags generic tags and patterns", () => {
    for (const t of ["#fyp", "#ForYou", "#foryoupage", "#viral", "#reels", "#explore", "#shorts",
      "#tiktok", "#instagram", "#youtube", "#reel", "#explorepage", "#instagood", "#trending",
      "#fypシ", "#fypツ", "#viralpost", "#tiktokviral"]) {
      expect(isNoiseTag(t), t).toBe(true);
    }
    expect(isNoiseTag("#mealprep")).toBe(false);
    expect(isNoiseTag("#booktok")).toBe(false);
  });

  it("merges hashtag, spaced and plural variants", () => {
    expect(termKey("#mealprep")).toBe("mealprep");
    expect(termKey("meal prep")).toBe("mealprep");
    expect(termKey("#mealpreps")).toBe("mealprep");
    expect(termKey("fitness")).toBe("fitness"); // "ss" is not a plural
  });
});

describe("extractNicheTerms", () => {
  it("worked example: a meal-prep creator", () => {
    const posts = [
      post("Sunday meal prep for the week 🍱 high protein chicken bowls #mealprep #fyp", [], 50_000),
      post("Meal prep on a budget! #mealprep #budgetmeals #viral", [], 120_000),
      post("High protein breakfast ideas #highprotein #mealprep #foryou", [], 8_000),
      post("Chicken burrito bowls in 20 min #mealprep #highprotein #reels", [], 30_000),
      post("Grocery haul @aldi https://link.to/x #budgetmeals", [], 5_000),
    ];
    // #mealprep: 4 posts (merged with "meal prep"); #highprotein: 2 posts as a tag + 1 as
    // "high protein" = 3; then 2-post terms: #budgetmeals (hashtag boost) beats
    // "chicken" and "bowls". "chicken" and "bowl" don't overlap anything picked.
    expect(extractNicheTerms(posts)).toEqual([
      "#mealprep",
      "#highprotein",
      "#budgetmeals",
      "chicken",
      "bowls",
    ]);
  });

  it("prefers terms across multiple posts over a one-off hashtag", () => {
    const posts = [
      post("sourdough starter tips", ["oneoff"]),
      post("my sourdough loaf"),
      post("sourdough scoring"),
    ];
    expect(extractNicheTerms(posts, 1)).toEqual(["sourdough"]);
  });

  it("returns a bigram over its component words when they co-occur", () => {
    const posts = [post("budget travel in Lisbon"), post("budget travel hacks"), post("budget travel Japan")];
    const terms = extractNicheTerms(posts, 3);
    expect(terms[0]).toBe("budget travel");
    expect(terms).not.toContain("budget");
    expect(terms).not.toContain("travel");
  });

  it("uses the hashtag spelling when the creator used one", () => {
    const posts = [post("book tok favourites"), post("book tok haul"), post("reading", ["#BookTok"])];
    expect(extractNicheTerms(posts, 1)).toEqual(["#booktok"]);
  });

  it("weights engagement lightly: breaks ties between equally frequent terms", () => {
    const posts = [post("#knitting", [], 100), post("#crochet", [], 1_000_000)];
    expect(extractNicheTerms(posts, 2)).toEqual(["#crochet", "#knitting"]);
  });

  it("engagement does not beat frequency", () => {
    const posts = [
      post("#knitting", [], 10),
      post("#knitting", [], 10),
      post("#crochet", [], 10_000_000),
    ];
    expect(extractNicheTerms(posts, 1)).toEqual(["#knitting"]);
  });

  it("returns only noise-free lowercase terms and respects max", () => {
    const posts = Array.from({ length: 6 }, (_, i) =>
      post(`Morning YOGA flow ${i} #yoga #fyp #viral #explore #Mobility #Stretching @studio`),
    );
    const terms = extractNicheTerms(posts, 3);
    expect(terms).toHaveLength(3);
    for (const t of terms) {
      expect(t).toBe(t.toLowerCase());
      expect(isNoiseTag(t)).toBe(false);
      expect(t).not.toMatch(/@|\d/);
    }
    expect(terms).toContain("#yoga");
  });

  it("edge cases: empty input, max 0, only noise, missing captions", () => {
    expect(extractNicheTerms([])).toEqual([]);
    expect(extractNicheTerms([post("cooking")], 0)).toEqual([]);
    expect(extractNicheTerms([post("#fyp #viral the and 🔥🔥 123", ["foryou"])])).toEqual([]);
    const broken = { ...post(""), caption: undefined, hashtags: undefined } as unknown as Video;
    expect(extractNicheTerms([broken])).toEqual([]);
  });

  it("is deterministic for the same input", () => {
    const posts = [post("alpha beta gamma"), post("delta epsilon zeta")];
    expect(extractNicheTerms(posts)).toEqual(extractNicheTerms(posts));
  });
});
