import type { Platform, Video } from "../../shared/types.ts";

const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 1234 -> "1.2K", 1_250_000 -> "1.3M". Missing values render as an em dash. */
export function formatCompact(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return compactFormatter.format(n);
}

/** "just now", "5m ago", "3h ago", "3d ago", "2w ago", "4mo ago", "1y ago". */
export function formatRelative(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "Unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Unknown";
  return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** (likes + comments + shares) / views, ignoring missing parts. Undefined if views unknown or zero. */
export function engagementRate(video: Video): number | undefined {
  const { views, likes, comments, shares } = video.stats;
  if (!views || views <= 0) return undefined;
  const parts = [likes, comments, shares].filter((n): n is number => typeof n === "number");
  if (parts.length === 0) return undefined;
  return parts.reduce((a, b) => a + b, 0) / views;
}

export function formatPercent(rate: number | undefined): string {
  if (rate === undefined) return "—";
  const pct = rate * 100;
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube Shorts",
};

export const PLATFORM_SHORT: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};
