// Shared between the frontend and Netlify Functions. See docs/PRD.md §6.3.

export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface Video {
  id: string;
  platform: Platform;
  url: string;
  thumbnailUrl: string;
  caption: string;
  hashtags: string[];
  author: { handle: string; displayName?: string; followers?: number; avatarUrl?: string };
  stats: { views?: number; likes?: number; comments?: number; shares?: number };
  postedAt?: string;
  durationSec?: number;
  soundName?: string;
  trendScore: number;
}

export interface HealthResponse {
  ok: boolean;
  apiKeyConfigured: boolean;
}
