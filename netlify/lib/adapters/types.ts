// Contract between the platform adapters (owned by the Scrape Creators API specialist)
// and the Netlify Functions / Scrape Creators client (owned by the backend engineer).

import type { Platform, Video } from "../../../shared/types.ts";

/** The only Scrape Creators paths the app may call (PRD §6.2). */
export const ALLOWED_PATHS = [
  "/v1/tiktok/get-trending-feed",
  "/v1/tiktok/search/keyword",
  "/v1/tiktok/search/top",
  "/v1/tiktok/search/hashtag",
  "/v1/tiktok/profile",
  "/v3/tiktok/profile/videos",
  "/v1/tiktok/video/transcript",
  "/v1/instagram/reels/trending",
  "/v2/instagram/reels/search",
  "/v1/instagram/search/hashtag",
  "/v1/instagram/profile",
  "/v1/instagram/user/reels",
  "/v2/instagram/media/transcript",
  "/v1/youtube/shorts/trending",
  "/v1/youtube/search",
  "/v1/youtube/search/hashtag",
  "/v1/youtube/channel",
  "/v1/youtube/channel/shorts",
  "/v1/youtube/video/transcript",
] as const;
export type AllowedPath = (typeof ALLOWED_PATHS)[number];

/**
 * Calls Scrape Creators and resolves with the parsed JSON body.
 * Implemented by the backend (adds the API key, caching, error mapping).
 * Rejects with ScrapeCreatorsError on non-2xx responses.
 */
export type ScFetch = (path: AllowedPath, params: Record<string, string>) => Promise<unknown>;

export class ScrapeCreatorsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ScrapeCreatorsError";
    this.status = status;
  }
}

export interface ProfileWithPosts {
  handle: string;
  followers?: number;
  /** The creator's recent videos, normalised. */
  videos: Video[];
}

/**
 * Each adapter normalises raw responses into the shared Video model.
 * Adapters set trendScore to 0; scoring happens afterwards in shared/scoring.ts.
 */
export interface PlatformAdapter {
  platform: Platform;
  trending(sc: ScFetch): Promise<Video[]>;
  /** `term` starting with "#" means hashtag search; otherwise keyword search. */
  search(sc: ScFetch, term: string): Promise<Video[]>;
  profile(sc: ScFetch, handle: string): Promise<ProfileWithPosts>;
  /** Returns null when the video has no transcript. */
  transcript(sc: ScFetch, videoUrl: string): Promise<string | null>;
}
