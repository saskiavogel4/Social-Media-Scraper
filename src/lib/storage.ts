import type { Video } from "../../shared/types.ts";

const PASSWORD_KEY = "trendscout.password";
const SAVED_KEY = "trendscout.saved";

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

export function loadSaved(): Video[] {
  const raw = read(SAVED_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isVideoLike) : [];
  } catch {
    return [];
  }
}

export function storeSaved(videos: readonly Video[]): void {
  write(SAVED_KEY, JSON.stringify(videos));
}

export const videoKey = (v: Pick<Video, "platform" | "id">): string => `${v.platform}:${v.id}`;
