import type { PlatformChoice, TimeWindow } from "../../shared/api.ts";

/** Options shared by the search form and the profile's search defaults. */
export const PLATFORM_CHOICES: readonly { value: PlatformChoice; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube Shorts" },
  { value: "all", label: "All" },
];

export const WINDOW_OPTIONS: readonly { value: TimeWindow; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "any", label: "Any time" },
];

export const MIN_VIEW_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: "Any" },
  { value: 10_000, label: "10K+" },
  { value: 100_000, label: "100K+" },
  { value: 1_000_000, label: "1M+" },
];
