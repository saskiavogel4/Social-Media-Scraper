import { describe, expect, it } from "vitest";
import type { Video } from "./types.ts";
import {
  dedupeVideos,
  engagementRate,
  filterVideos,
  scoreVideos,
  signalScores,
  trendScore,
} from "./scoring.ts";
import { SCORE_WEIGHTS } from "./scoringConfig.ts";

const NOW = new Date("2026-01-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function video(overrides: Partial<Video> & { id: string }): Video {
  return {
    platform: "tiktok",
    url: `https://example.com/${overrides.id}`,
    thumbnailUrl: "",
    caption: "",
    hashtags: [],
    author: { handle: "someone" },
    stats: {},
    trendScore: 0,
    ...overrides,
  };
}

// Worked example A: a 10k-follower creator's video hits 1M views in its first day.
//   engagement = (100k + 5k + 15k) / 1M = 12%      -> 12 / 15            = 0.800
//   velocity   = 1M / 24h = 41,667/h               -> (log10 41,667 - 1)/4 = 0.905
//   outperform = 1M / 10k = 100x                   -> capped              = 1.000
//   score = 0.30*0.800 + 0.35*0.905 + 0.35*1.000 = 0.907 -> 91
const smallCreatorViral = video({
  id: "A",
  author: { handle: "small", followers: 10_000 },
  stats: { views: 1_000_000, likes: 100_000, comments: 5_000, shares: 15_000 },
  postedAt: hoursAgo(24),
});

// Worked example B: a 20M-follower celebrity's ordinary post, 3 days old.
//   engagement = 105k / 2M = 5.25%                 -> 0.350
//   velocity   = 2M / 72h = 27,778/h               -> 0.861
//   outperform = 2M / 20M = 0.1x                   -> 0 (the floor)
//   score = 0.105 + 0.301 + 0 = 0.406 -> 41
const celebrityAverage = video({
  id: "B",
  platform: "instagram",
  author: { handle: "celeb", followers: 20_000_000 },
  stats: { views: 2_000_000, likes: 100_000, comments: 2_000, shares: 3_000 },
  postedAt: hoursAgo(72),
});

// Worked example C: follower count unknown (common in search results).
//   engagement = 9,600 / 100k = 9.6%               -> 0.640
//   velocity   = 100k / 10h = 10,000/h             -> 0.750
//   outperform = missing -> left out, weights renormalised over 0.65
//   average = (0.30*0.64 + 0.35*0.75) / 0.65 = 0.6992
//   confidence = 1 - 0.2 * 0.35 = 0.93  -> 0.6503 -> 65
const missingFollowers = video({
  id: "C",
  platform: "youtube",
  stats: { views: 100_000, likes: 9_000, comments: 600 },
  postedAt: hoursAgo(10),
});

describe("engagementRate", () => {
  it("is (likes + comments + shares) / views", () => {
    expect(engagementRate(smallCreatorViral)).toBeCloseTo(0.12, 10);
  });

  it("leaves out missing counts instead of treating them as zero-only", () => {
    expect(engagementRate(missingFollowers)).toBeCloseTo(0.096, 10);
  });

  it("is undefined when views are missing or zero", () => {
    expect(engagementRate(video({ id: "x", stats: { likes: 10 } }))).toBeUndefined();
    expect(engagementRate(video({ id: "x", stats: { views: 0, likes: 10 } }))).toBeUndefined();
  });

  it("is undefined when no like/comment/share counts are known", () => {
    expect(engagementRate(video({ id: "x", stats: { views: 1000 } }))).toBeUndefined();
  });

  it("ignores negative / NaN counts", () => {
    expect(
      engagementRate(video({ id: "x", stats: { views: 1000, likes: -5, comments: NaN, shares: 10 } })),
    ).toBeCloseTo(0.01, 10);
  });
});

describe("trendScore worked examples", () => {
  it("A: small creator going viral scores 91", () => {
    const s = signalScores(smallCreatorViral, NOW);
    expect(s.engagement).toBeCloseTo(0.8, 3);
    expect(s.velocity).toBeCloseTo(0.905, 3);
    expect(s.outperformance).toBe(1);
    expect(trendScore(smallCreatorViral, NOW)).toBe(91);
  });

  it("B: celebrity average post scores 41, well below A despite 2x the views", () => {
    const s = signalScores(celebrityAverage, NOW);
    expect(s.engagement).toBeCloseTo(0.35, 3);
    expect(s.velocity).toBeCloseTo(0.861, 3);
    expect(s.outperformance).toBe(0);
    expect(trendScore(celebrityAverage, NOW)).toBe(41);
  });

  it("C: missing followers are excluded and weights renormalised (65)", () => {
    const s = signalScores(missingFollowers, NOW);
    expect(s.outperformance).toBeUndefined();
    expect(trendScore(missingFollowers, NOW)).toBe(65);
  });

  it("weights sum to 1 so the config reads as percentages", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("trendScore behaviour", () => {
  it("recency: a fresh fast-growing video beats an old one with far bigger totals", () => {
    const old = video({
      id: "old",
      author: { handle: "a", followers: 1_000_000 },
      stats: { views: 5_000_000, likes: 250_000 },
      postedAt: hoursAgo(24 * 365),
    });
    const fresh = video({
      id: "fresh",
      author: { handle: "a", followers: 1_000_000 },
      stats: { views: 400_000, likes: 32_000 },
      postedAt: hoursAgo(3),
    });
    expect(trendScore(fresh, NOW)).toBeGreaterThan(trendScore(old, NOW));
  });

  it("returns a low score, not a crash, when there are no usable signals", () => {
    expect(trendScore(video({ id: "x" }), NOW)).toBe(0);
    expect(trendScore(video({ id: "x", stats: { likes: 50 } }), NOW)).toBe(0);
  });

  it("zero views scores 0", () => {
    const v = video({
      id: "z",
      author: { handle: "a", followers: 1000 },
      stats: { views: 0, likes: 0 },
      postedAt: hoursAgo(5),
    });
    expect(trendScore(v, NOW)).toBe(0);
  });

  it("ignores engagement on tiny view counts (too noisy)", () => {
    const v = video({ id: "t", stats: { views: 10, likes: 9 }, postedAt: hoursAgo(1) });
    expect(signalScores(v, NOW).engagement).toBeUndefined();
    expect(signalScores(v, NOW).velocity).toBe(0); // 10 views/h is the floor
  });

  it("caps engagement at 1 and velocity at 1", () => {
    const v = video({
      id: "c",
      stats: { views: 10_000_000, likes: 5_000_000 },
      postedAt: hoursAgo(2),
    });
    const s = signalScores(v, NOW);
    expect(s.engagement).toBe(1);
    expect(s.velocity).toBe(1);
  });

  it("treats a slightly-future postedAt as just posted (1h age)", () => {
    const v = video({ id: "f", stats: { views: 1000 }, postedAt: hoursAgo(-2) });
    // 1000 views / 1h -> (3 - 1) / 4 = 0.5
    expect(signalScores(v, NOW).velocity).toBeCloseTo(0.5, 10);
  });

  it("ignores velocity when postedAt is far in the future (bad data)", () => {
    const v = video({ id: "f", stats: { views: 1000 }, postedAt: hoursAgo(-48) });
    expect(signalScores(v, NOW).velocity).toBeUndefined();
  });

  it("ignores velocity when postedAt is unparseable", () => {
    const v = video({ id: "f", stats: { views: 1000 }, postedAt: "not a date" });
    expect(signalScores(v, NOW).velocity).toBeUndefined();
  });

  it("floors followers at 100 so brand-new accounts can't produce absurd ratios", () => {
    const zero = video({ id: "n", author: { handle: "n", followers: 0 }, stats: { views: 1000 } });
    // 1000 / 100 = 10x -> (1 + 1) / 3 = 0.667
    expect(signalScores(zero, NOW).outperformance).toBeCloseTo(2 / 3, 10);
  });

  it("applies the mild missing-data penalty: one perfect signal alone is not 100", () => {
    const onlyEngagement = video({ id: "e", stats: { views: 1000, likes: 200 } });
    // engagement 1.0, missing 0.7 of the weight -> 1 - 0.2*0.7 = 0.86
    expect(trendScore(onlyEngagement, NOW)).toBe(86);
  });

  it("always returns an integer between 0 and 100", () => {
    const vs = [smallCreatorViral, celebrityAverage, missingFollowers, video({ id: "q" })];
    for (const v of vs) {
      const s = trendScore(v, NOW);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("is stable regardless of what else is in the batch (no per-batch normalisation)", () => {
    const alone = scoreVideos([missingFollowers], NOW)[0].trendScore;
    const mixed = scoreVideos([smallCreatorViral, missingFollowers, celebrityAverage], NOW).find(
      (v) => v.id === "C",
    )!.trendScore;
    expect(mixed).toBe(alone);
  });
});

describe("scoreVideos", () => {
  it("sets trendScore and sorts descending", () => {
    const out = scoreVideos([celebrityAverage, missingFollowers, smallCreatorViral], NOW);
    expect(out.map((v) => [v.id, v.trendScore])).toEqual([
      ["A", 91],
      ["C", 65],
      ["B", 41],
    ]);
  });

  it("does not mutate the input", () => {
    const input = [smallCreatorViral];
    const out = scoreVideos(input, NOW);
    expect(input[0].trendScore).toBe(0);
    expect(out[0]).not.toBe(input[0]);
  });

  it("breaks ties by views, then platform:id, deterministically", () => {
    const a = video({ id: "b", stats: {} });
    const b = video({ id: "a", stats: {} });
    const c = video({ id: "c", stats: {}, platform: "instagram" });
    expect(scoreVideos([a, b, c], NOW).map((v) => `${v.platform}:${v.id}`)).toEqual([
      "instagram:c",
      "tiktok:a",
      "tiktok:b",
    ]);
  });

  it("handles empty input", () => {
    expect(scoreVideos([], NOW)).toEqual([]);
  });
});

describe("filterVideos", () => {
  const recent = video({ id: "r", stats: { views: 5000 }, postedAt: hoursAgo(5) });
  const weekOld = video({ id: "w", stats: { views: 50 }, postedAt: hoursAgo(24 * 6) });
  const monthOld = video({ id: "m", stats: { views: 1_000_000 }, postedAt: hoursAgo(24 * 29) });
  const ancient = video({ id: "a", stats: { views: 1_000_000 }, postedAt: hoursAgo(24 * 400) });
  const undated = video({ id: "u", stats: { views: 5000 } });
  const noViews = video({ id: "n", postedAt: hoursAgo(1) });
  const future = video({ id: "f", stats: { views: 5000 }, postedAt: hoursAgo(-3) });
  const all = [recent, weekOld, monthOld, ancient, undated, noViews, future];
  const ids = (vs: Video[]) => vs.map((v) => v.id);

  it("24h keeps only the last day (plus undated and future-dated)", () => {
    expect(ids(filterVideos(all, { window: "24h" }, NOW))).toEqual(["r", "u", "n", "f"]);
  });

  it("7d and 30d widen the window", () => {
    expect(ids(filterVideos(all, { window: "7d" }, NOW))).toEqual(["r", "w", "u", "n", "f"]);
    expect(ids(filterVideos(all, { window: "30d" }, NOW))).toEqual(["r", "w", "m", "u", "n", "f"]);
  });

  it("any keeps everything", () => {
    expect(ids(filterVideos(all, { window: "any" }, NOW))).toEqual(ids(all));
  });

  it("minViews drops low and unknown view counts", () => {
    expect(ids(filterVideos(all, { window: "any", minViews: 1000 }, NOW))).toEqual([
      "r",
      "m",
      "a",
      "u",
      "f",
    ]);
  });

  it("minViews 0 / undefined keeps unknown views", () => {
    expect(ids(filterVideos(all, { window: "any", minViews: 0 }, NOW))).toContain("n");
    expect(ids(filterVideos(all, { window: "any" }, NOW))).toContain("n");
  });

  it("keeps a video exactly on the window boundary", () => {
    const edge = video({ id: "e", postedAt: hoursAgo(24) });
    expect(ids(filterVideos([edge], { window: "24h" }, NOW))).toEqual(["e"]);
  });

  it("handles empty input", () => {
    expect(filterVideos([], { window: "7d", minViews: 10 }, NOW)).toEqual([]);
  });
});

describe("dedupeVideos", () => {
  it("removes duplicates by platform + id, keeping the first", () => {
    const a1 = video({ id: "1", caption: "first" });
    const a2 = video({ id: "1", caption: "second" });
    const b = video({ id: "1", platform: "youtube" });
    const out = dedupeVideos([a1, b, a2]);
    expect(out).toHaveLength(2);
    expect(out[0].caption).toBe("first");
    expect(out[1].platform).toBe("youtube");
  });

  it("handles empty input", () => {
    expect(dedupeVideos([])).toEqual([]);
  });
});
