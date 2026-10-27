import type { Video } from "../../shared/types.ts";
import { engagementRate } from "./format.ts";

export const SORT_OPTIONS = [
  { value: "trend", label: "Trend Score" },
  { value: "views", label: "Views" },
  { value: "engagement", label: "Engagement rate" },
  { value: "newest", label: "Newest" },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

function timeOf(v: Video): number {
  const t = v.postedAt ? Date.parse(v.postedAt) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/** Returns a new array sorted descending by the chosen key; unknown values sink to the bottom. */
export function sortVideos(videos: readonly Video[], key: SortKey): Video[] {
  const value = (v: Video): number => {
    switch (key) {
      case "trend":
        return v.trendScore;
      case "views":
        return v.stats.views ?? -Infinity;
      case "engagement":
        return engagementRate(v) ?? -Infinity;
      case "newest":
        return timeOf(v);
    }
  };
  return [...videos].sort((a, b) => {
    const d = value(b) - value(a);
    return Number.isNaN(d) ? 0 : d;
  });
}
