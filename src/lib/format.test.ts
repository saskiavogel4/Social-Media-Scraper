import { describe, expect, it } from "vitest";
import type { Video } from "../../shared/types.ts";
import { engagementRate, formatCompact, formatPercent, formatRelative } from "./format.ts";

describe("formatCompact", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1K"],
    [1234, "1.2K"],
    [15_300, "15.3K"],
    [1_250_000, "1.3M"],
    [1_000_000, "1M"],
    [2_400_000_000, "2.4B"],
  ])("%d -> %s", (n, expected) => {
    expect(formatCompact(n)).toBe(expected);
  });

  it("shows a dash for missing values", () => {
    expect(formatCompact(undefined)).toBe("—");
    expect(formatCompact(null)).toBe("—");
    expect(formatCompact(Number.NaN)).toBe("—");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it.each([
    [10_000, "just now"],
    [5 * MIN, "5m ago"],
    [3 * HOUR, "3h ago"],
    [3 * DAY, "3d ago"],
    [14 * DAY, "2w ago"],
    [90 * DAY, "3mo ago"],
    [400 * DAY, "1y ago"],
  ])("%d ms ago -> %s", (ms, expected) => {
    expect(formatRelative(ago(ms), now)).toBe(expected);
  });

  it("treats future dates as just now", () => {
    expect(formatRelative(new Date(now + HOUR).toISOString(), now)).toBe("just now");
  });

  it("returns empty string for missing or invalid dates", () => {
    expect(formatRelative(undefined, now)).toBe("");
    expect(formatRelative("not a date", now)).toBe("");
  });
});

describe("engagementRate", () => {
  const video = (stats: Video["stats"]): Video => ({
    id: "1",
    platform: "tiktok",
    url: "https://example.com",
    thumbnailUrl: "",
    caption: "",
    hashtags: [],
    author: { handle: "a" },
    stats,
    trendScore: 0,
  });

  it("sums the known interactions over views", () => {
    expect(engagementRate(video({ views: 1000, likes: 80, comments: 10, shares: 10 }))).toBeCloseTo(0.1);
    expect(engagementRate(video({ views: 1000, likes: 50 }))).toBeCloseTo(0.05);
  });

  it("is undefined without views or interactions", () => {
    expect(engagementRate(video({ likes: 5 }))).toBeUndefined();
    expect(engagementRate(video({ views: 0, likes: 5 }))).toBeUndefined();
    expect(engagementRate(video({ views: 100 }))).toBeUndefined();
  });

  it("formats as a percentage", () => {
    expect(formatPercent(0.0534)).toBe("5.3%");
    expect(formatPercent(0.123)).toBe("12%");
    expect(formatPercent(undefined)).toBe("—");
  });
});
