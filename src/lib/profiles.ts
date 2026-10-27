// Creator profiles: who is using the app on this device, their niche and how they like the UI.
// Browser-only (localStorage); no accounts, nothing is sent to the server.
// Everything read from storage is validated and repaired, so corrupt data can never crash the app.
import { MAX_TERMS, sanitizeTerm, TIME_WINDOWS, type PlatformChoice, type TimeWindow } from "../../shared/api.ts";
import { MIN_VIEW_OPTIONS } from "./searchOptions.ts";
import { SORT_OPTIONS, type SortKey } from "./sort.ts";

export const PROFILES_KEY = "trendscout.profiles";
export const ACTIVE_PROFILE_KEY = "trendscout.activeProfile";
/** Saved ideas from before profiles existed; moved into the first profile created. */
export const LEGACY_SAVED_KEY = "trendscout.saved";
export const savedKey = (profileId: string): string => `${LEGACY_SAVED_KEY}.${profileId}`;

export const MAX_NAME_LENGTH = 40;
export const MAX_PROFILES = 20;
/** Same rule the server applies to handles (netlify/lib/validate.ts). */
const HANDLE = /^[A-Za-z0-9._-]{1,64}$/;
const ID = /^[A-Za-z0-9-]{1,64}$/;

export const AVATARS = ["🎬", "📸", "🎤", "💪", "🍳", "✈️", "📚", "🎨", "🎮", "🌿", "💄", "🐶"] as const;
export type Avatar = (typeof AVATARS)[number];
/** Accessible names for the avatar picker. */
export const AVATAR_LABELS: Record<Avatar, string> = {
  "🎬": "Clapperboard",
  "📸": "Camera",
  "🎤": "Microphone",
  "💪": "Flexed arm",
  "🍳": "Frying pan",
  "✈️": "Airplane",
  "📚": "Books",
  "🎨": "Palette",
  "🎮": "Game controller",
  "🌿": "Herb",
  "💄": "Lipstick",
  "🐶": "Dog",
};

export const THEMES = ["system", "light", "dark"] as const;
export type ThemePref = (typeof THEMES)[number];

export const ACCENTS = ["violet", "blue", "emerald", "rose", "amber", "slate"] as const;
export type Accent = (typeof ACCENTS)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

const PLATFORMS: readonly PlatformChoice[] = ["tiktok", "instagram", "youtube", "all"];
const SORT_KEYS: readonly SortKey[] = SORT_OPTIONS.map((o) => o.value);
const MIN_VIEWS: readonly number[] = MIN_VIEW_OPTIONS.map((o) => o.value);

export interface Appearance {
  theme: ThemePref;
  accent: Accent;
  density: Density;
}

export interface Profile extends Appearance {
  id: string;
  name: string;
  avatar: Avatar;
  createdAt: string;
  primaryPlatform: PlatformChoice;
  /** Without the leading @. */
  handle?: string;
  nicheTerms: string[];
  defaultSort: SortKey;
  defaultWindow: TimeWindow;
  defaultMinViews: number;
}

/** What the profile form edits. */
export type ProfileDraft = Omit<Profile, "id" | "createdAt">;

export interface ProfileStore {
  profiles: Profile[];
  activeId: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "system", accent: "violet", density: "comfortable" };

export const DEFAULT_DRAFT: ProfileDraft = {
  name: "",
  avatar: AVATARS[0],
  primaryPlatform: "tiktok",
  handle: undefined,
  nicheTerms: [],
  ...DEFAULT_APPEARANCE,
  defaultSort: "trend",
  defaultWindow: "7d",
  defaultMinViews: 0,
};

export const EMPTY_STORE: ProfileStore = { profiles: [], activeId: null };

// ---------- validation ----------

const oneOf = <T>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Trims and collapses whitespace; returns "" when nothing usable is left. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

/** A human-readable problem with the name, or null when it's fine. */
export function nameError(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return "Enter a name for your profile.";
  if (name.length > MAX_NAME_LENGTH) return `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`;
  return null;
}

/** Strips a leading @ and whitespace; returns undefined unless it's a valid handle. */
export function cleanHandle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const h = raw.trim().replace(/^@+/, "");
  return HANDLE.test(h) ? h : undefined;
}

/** Sanitises terms with the same rules as the search chips, dedupes case-insensitively, keeps at most 5. */
export function cleanTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = sanitizeTerm(item);
    if (!t || out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

/** Coerces anything into a valid draft, falling back to defaults field by field. Name may be "". */
export function cleanDraft(raw: unknown): ProfileDraft {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_DRAFT;
  return {
    name: cleanName(r.name),
    avatar: oneOf(AVATARS, r.avatar, d.avatar),
    primaryPlatform: oneOf(PLATFORMS, r.primaryPlatform, d.primaryPlatform),
    handle: cleanHandle(r.handle),
    nicheTerms: cleanTerms(r.nicheTerms),
    theme: oneOf(THEMES, r.theme, d.theme),
    accent: oneOf(ACCENTS, r.accent, d.accent),
    density: oneOf(DENSITIES, r.density, d.density),
    defaultSort: oneOf(SORT_KEYS, r.defaultSort, d.defaultSort),
    defaultWindow: oneOf(TIME_WINDOWS, r.defaultWindow, d.defaultWindow),
    defaultMinViews: oneOf(MIN_VIEWS, r.defaultMinViews, d.defaultMinViews),
  };
}

/** Repairs one stored profile. Returns null when it can't be saved (no usable id or name). */
export function repairProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id)) return null;
  const draft = cleanDraft(r);
  if (!draft.name) return null;
  const created = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
  return {
    id: r.id,
    createdAt: Number.isNaN(created) ? new Date(0).toISOString() : new Date(created).toISOString(),
    ...draft,
  };
}

/** Parses the two stored values into a valid store, dropping anything broken. */
export function parseStore(rawProfiles: string | null, rawActive: string | null): ProfileStore {
  let list: unknown;
  try {
    list = rawProfiles ? JSON.parse(rawProfiles) : [];
  } catch {
    list = [];
  }
  const profiles: Profile[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(list) ? list : []) {
    const p = repairProfile(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    profiles.push(p);
    if (profiles.length >= MAX_PROFILES) break;
  }
  const activeId = rawActive && seen.has(rawActive) ? rawActive : (profiles[0]?.id ?? null);
  return { profiles, activeId };
}

// ---------- storage ----------

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage, or null when the browser blocks it (private mode, disabled storage). */
export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function get(storage: KeyValueStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(storage: KeyValueStorage | null, key: string, value: string | null): void {
  try {
    if (!storage) return;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Quota or disabled storage: the app keeps working for this session.
  }
}

export function loadProfiles(storage: KeyValueStorage | null = browserStorage()): ProfileStore {
  const rawProfiles = get(storage, PROFILES_KEY);
  const rawActive = get(storage, ACTIVE_PROFILE_KEY);
  const store = parseStore(rawProfiles, rawActive);
  // Write back repairs so the next load (and other tabs) see clean data.
  if (rawProfiles !== null && (rawProfiles !== JSON.stringify(store.profiles) || rawActive !== store.activeId)) {
    saveProfiles(store, storage);
  }
  return store;
}

export function saveProfiles(store: ProfileStore, storage: KeyValueStorage | null = browserStorage()): void {
  set(storage, PROFILES_KEY, JSON.stringify(store.profiles));
  set(storage, ACTIVE_PROFILE_KEY, store.activeId);
}

/** Moves pre-profile saved ideas into a profile's own list (only if that list is still empty). */
export function migrateLegacySaved(profileId: string, storage: KeyValueStorage | null = browserStorage()): boolean {
  const legacy = get(storage, LEGACY_SAVED_KEY);
  if (legacy === null) return false;
  if (get(storage, savedKey(profileId)) === null) set(storage, savedKey(profileId), legacy);
  set(storage, LEGACY_SAVED_KEY, null);
  return true;
}

// ---------- operations (return a new store and persist it) ----------

export class ProfileError extends Error {}

export function newProfileId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fall through to the non-crypto id (not security-sensitive; just unique per device).
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateOptions {
  storage?: KeyValueStorage | null;
  now?: Date;
  id?: string;
}

/** Adds a profile and makes it active. The first profile ever created inherits the old saved ideas. */
export function createProfile(
  store: ProfileStore,
  draft: Partial<ProfileDraft>,
  { storage = browserStorage(), now = new Date(), id = newProfileId() }: CreateOptions = {},
): { store: ProfileStore; profile: Profile } {
  const err = nameError(typeof draft.name === "string" ? draft.name : "");
  if (err) throw new ProfileError(err);
  if (store.profiles.length >= MAX_PROFILES) throw new ProfileError(`You can have up to ${MAX_PROFILES} profiles.`);
  const profile: Profile = { id, createdAt: now.toISOString(), ...cleanDraft({ ...DEFAULT_DRAFT, ...draft }) };
  if (store.profiles.length === 0) migrateLegacySaved(profile.id, storage);
  const next = { profiles: [...store.profiles, profile], activeId: profile.id };
  saveProfiles(next, storage);
  return { store: next, profile };
}

export function updateProfile(
  store: ProfileStore,
  id: string,
  patch: Partial<ProfileDraft>,
  storage: KeyValueStorage | null = browserStorage(),
): ProfileStore {
  const current = store.profiles.find((p) => p.id === id);
  if (!current) return store;
  if (patch.name !== undefined) {
    const err = nameError(patch.name);
    if (err) throw new ProfileError(err);
  }
  const updated: Profile = { id, createdAt: current.createdAt, ...cleanDraft({ ...current, ...patch }) };
  const next = { ...store, profiles: store.profiles.map((p) => (p.id === id ? updated : p)) };
  saveProfiles(next, storage);
  return next;
}

/** Removes a profile and its saved ideas. If it was active, the first remaining profile (if any) becomes active. */
export function deleteProfile(store: ProfileStore, id: string, storage: KeyValueStorage | null = browserStorage()): ProfileStore {
  if (!store.profiles.some((p) => p.id === id)) return store;
  const profiles = store.profiles.filter((p) => p.id !== id);
  const activeId = store.activeId === id || !profiles.some((p) => p.id === store.activeId) ? (profiles[0]?.id ?? null) : store.activeId;
  const next = { profiles, activeId };
  set(storage, savedKey(id), null);
  saveProfiles(next, storage);
  return next;
}

export function switchProfile(store: ProfileStore, id: string, storage: KeyValueStorage | null = browserStorage()): ProfileStore {
  if (store.activeId === id || !store.profiles.some((p) => p.id === id)) return store;
  const next = { ...store, activeId: id };
  saveProfiles(next, storage);
  return next;
}

export const activeProfile = (store: ProfileStore): Profile | null =>
  store.profiles.find((p) => p.id === store.activeId) ?? null;

export const appearanceOf = (p: Pick<Profile, keyof Appearance> | null): Appearance =>
  p ? { theme: p.theme, accent: p.accent, density: p.density } : DEFAULT_APPEARANCE;
