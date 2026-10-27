import type { Video } from "../../shared/types.ts";
import { savedKey } from "./profiles.ts";

const PASSWORD_KEY = "trendscout.password";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode, quota); the app still works for this session.
  }
}

export const getPassword = (): string | null => read(PASSWORD_KEY);
export const setPassword = (pw: string): void => write(PASSWORD_KEY, pw);
export const clearPassword = (): void => write(PASSWORD_KEY, null);

function isVideoLike(x: unknown): x is Video {
  if (!x || typeof x !== "object") return false;
  const v = x as Partial<Video>;
  return typeof v.id === "string" && typeof v.platform === "string" && typeof v.url === "string" && !!v.author && !!v.stats;
}

/** Saved ideas are stored per profile (see profiles.ts). */
export function loadSaved(profileId: string): Video[] {
  const raw = read(savedKey(profileId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isVideoLike) : [];
  } catch {
    return [];
  }
}

export function storeSaved(profileId: string, videos: readonly Video[]): void {
  write(savedKey(profileId), JSON.stringify(videos));
}

export const videoKey = (v: Pick<Video, "platform" | "id">): string => `${v.platform}:${v.id}`;
