import type { Platform } from "../../../shared/types.ts";
import { instagramAdapter } from "./instagram.ts";
import { tiktokAdapter } from "./tiktok.ts";
import type { PlatformAdapter } from "./types.ts";
import { youtubeAdapter } from "./youtube.ts";

export const adapters: Record<Platform, PlatformAdapter> = {
  tiktok: tiktokAdapter,
  instagram: instagramAdapter,
  youtube: youtubeAdapter,
};

export { instagramAdapter, tiktokAdapter, youtubeAdapter };
export type { PlatformAdapter, ProfileWithPosts, ScFetch } from "./types.ts";
