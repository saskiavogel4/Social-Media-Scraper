import { describe, expect, it } from "vitest";
import {
  ACTIVE_PROFILE_KEY,
  DEFAULT_DRAFT,
  EMPTY_STORE,
  LEGACY_SAVED_KEY,
  MAX_NAME_LENGTH,
  PROFILES_KEY,
  ProfileError,
  activeProfile,
  appearanceOf,
  cleanDraft,
  cleanHandle,
  cleanTerms,
  createProfile,
  deleteProfile,
  loadProfiles,
  migrateLegacySaved,
  nameError,
  parseStore,
  repairProfile,
  savedKey,
  switchProfile,
  updateProfile,
  type KeyValueStorage,
} from "./profiles.ts";

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** Storage that throws on every call, like Safari private mode or disabled cookies. */
const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const NOW = new Date("2026-10-27T12:00:00.000Z");

function setup() {
  const storage = new MemoryStorage();
  let n = 0;
  const create = (store = loadProfiles(storage), name = `Creator ${n + 1}`, extra = {}) =>
    createProfile(store, { ...DEFAULT_DRAFT, name, ...extra }, { storage, now: NOW, id: `id-${++n}` });
  return { storage, create };
}

describe("createProfile", () => {
  it("creates a profile with defaults, makes it active and persists it", () => {
    const { storage, create } = setup();
    const { store, profile } = create(EMPTY_STORE, "  Sam's   kitchen ");
    expect(profile).toEqual({
      ...DEFAULT_DRAFT,
      id: "id-1",
      name: "Sam's kitchen",
      handle: undefined,
      createdAt: NOW.toISOString(),
    });
    expect(store.activeId).toBe("id-1");
    expect(activeProfile(store)?.name).toBe("Sam's kitchen");
    expect(loadProfiles(storage)).toEqual(store);
    expect(storage.getItem(ACTIVE_PROFILE_KEY)).toBe("id-1");
  });

  it("requires a name of 1 to 40 characters", () => {
    const { create } = setup();
    expect(() => create(EMPTY_STORE, "   ")).toThrow(ProfileError);
    expect(() => create(EMPTY_STORE, "x".repeat(MAX_NAME_LENGTH + 1))).toThrow(/40 characters/);
    expect(create(EMPTY_STORE, "x".repeat(MAX_NAME_LENGTH)).profile.name).toHaveLength(MAX_NAME_LENGTH);
    expect(nameError("")).toBe("Enter a name for your profile.");
    expect(nameError("Sam")).toBeNull();
  });

  it("sanitises niche terms with the search-chip rules and keeps at most 5", () => {
    const { create } = setup();
    const { profile } = create(EMPTY_STORE, "Sam", {
      nicheTerms: ["meal prep 🍱", "#book tok", "Meal Prep", "&&&", "a", "b", "c", "d", "e"],
    });
    expect(profile.nicheTerms).toEqual(["meal prep", "#booktok", "a", "b", "c"]);
  });

  it("cleans the handle and drops invalid ones", () => {
    expect(cleanHandle(" @@fit.coach_1 ")).toBe("fit.coach_1");
    expect(cleanHandle("not a handle!")).toBeUndefined();
    expect(cleanHandle("")).toBeUndefined();
    const { create } = setup();
    expect(create(EMPTY_STORE, "Sam", { handle: "@sam" }).profile.handle).toBe("sam");
  });

  it("falls back to defaults for unknown preferences", () => {
    const { create } = setup();
    const bad = { theme: "neon", accent: "chartreuse", density: "huge", defaultSort: "random", defaultWindow: "1y", defaultMinViews: 7, primaryPlatform: "myspace", avatar: "X" };
    const { profile } = create(EMPTY_STORE, "Sam", bad);
    expect(profile).toMatchObject({
      theme: "system",
      accent: "violet",
      density: "comfortable",
      defaultSort: "trend",
      defaultWindow: "7d",
      defaultMinViews: 0,
      primaryPlatform: "tiktok",
      avatar: DEFAULT_DRAFT.avatar,
    });
  });
});

describe("saved ideas migration", () => {
  it("moves the pre-profile saved list into the first profile only", () => {
    const { storage, create } = setup();
    const legacy = JSON.stringify([{ id: "v1" }]);
    storage.setItem(LEGACY_SAVED_KEY, legacy);

    const first = create(EMPTY_STORE, "First");
    expect(storage.getItem(savedKey("id-1"))).toBe(legacy);
    expect(storage.getItem(LEGACY_SAVED_KEY)).toBeNull();

    // A later legacy list (e.g. from an old tab) isn't pulled into a second profile.
    storage.setItem(LEGACY_SAVED_KEY, legacy);
    create(first.store, "Second");
    expect(storage.getItem(savedKey("id-2"))).toBeNull();
  });

  it("never overwrites a profile's existing saved list", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SAVED_KEY, "[1]");
    storage.setItem(savedKey("p1"), "[2]");
    expect(migrateLegacySaved("p1", storage)).toBe(true);
    expect(storage.getItem(savedKey("p1"))).toBe("[2]");
    expect(migrateLegacySaved("p1", storage)).toBe(false);
  });
});

describe("update, switch and delete", () => {
  it("updates fields, re-validates, and keeps id and createdAt", () => {
    const { storage, create } = setup();
    const { store } = create(EMPTY_STORE, "Sam");
    const next = updateProfile(store, "id-1", { name: "Sam B", accent: "emerald", theme: "dark", density: "compact", nicheTerms: ["#gym", "#gym"] }, storage);
    expect(activeProfile(next)).toMatchObject({ id: "id-1", createdAt: NOW.toISOString(), name: "Sam B", accent: "emerald", theme: "dark", density: "compact", nicheTerms: ["#gym"] });
    expect(loadProfiles(storage)).toEqual(next);
    expect(() => updateProfile(next, "id-1", { name: "" }, storage)).toThrow(ProfileError);
    expect(updateProfile(next, "missing", { name: "X" }, storage)).toBe(next);
  });

  it("switches the active profile", () => {
    const { storage, create } = setup();
    const a = create(EMPTY_STORE, "A");
    const b = create(a.store, "B");
    expect(b.store.activeId).toBe("id-2");
    const switched = switchProfile(b.store, "id-1", storage);
    expect(switched.activeId).toBe("id-1");
    expect(storage.getItem(ACTIVE_PROFILE_KEY)).toBe("id-1");
    expect(switchProfile(switched, "nope", storage)).toBe(switched);
  });

  it("deletes a profile and its saved ideas, falling back to the first remaining", () => {
    const { storage, create } = setup();
    const a = create(EMPTY_STORE, "A");
    const b = create(a.store, "B");
    storage.setItem(savedKey("id-1"), "[]");
    storage.setItem(savedKey("id-2"), "[]");

    const afterB = deleteProfile(b.store, "id-2", storage);
    expect(afterB).toEqual({ profiles: [a.profile], activeId: "id-1" });
    expect(storage.getItem(savedKey("id-2"))).toBeNull();
    expect(storage.getItem(savedKey("id-1"))).toBe("[]");

    const empty = deleteProfile(afterB, "id-1", storage);
    expect(empty).toEqual(EMPTY_STORE);
    expect(loadProfiles(storage)).toEqual(EMPTY_STORE);
  });

  it("deleting an inactive profile keeps the active one", () => {
    const { storage, create } = setup();
    const a = create(EMPTY_STORE, "A");
    const b = create(a.store, "B");
    expect(deleteProfile(b.store, "id-1", storage).activeId).toBe("id-2");
  });
});

describe("loading corrupt storage", () => {
  it("returns an empty store for missing, non-JSON or non-array data", () => {
    expect(parseStore(null, null)).toEqual(EMPTY_STORE);
    expect(parseStore("{not json", "x")).toEqual(EMPTY_STORE);
    expect(parseStore('{"a":1}', null)).toEqual(EMPTY_STORE);
    expect(parseStore("null", null)).toEqual(EMPTY_STORE);
  });

  it("repairs fields, drops unusable and duplicate profiles, and fixes the active id", () => {
    const raw = JSON.stringify([
      null,
      42,
      { id: "no-name" },
      { id: "bad id with spaces", name: "X" },
      { id: "p1", name: "  Kept  ", theme: "purple", nicheTerms: "not-an-array", handle: 5, createdAt: "yesterday", defaultMinViews: "100000" },
      { id: "p1", name: "Duplicate" },
      { id: "p2", name: "Second", nicheTerms: ["ok", 7, "#fine"], accent: "rose", createdAt: "2026-01-01T00:00:00Z" },
    ]);
    const store = parseStore(raw, "ghost");
    expect(store.profiles.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(store.activeId).toBe("p1");
    expect(store.profiles[0]).toMatchObject({ name: "Kept", theme: "system", nicheTerms: [], handle: undefined, createdAt: new Date(0).toISOString(), defaultMinViews: 0 });
    expect(store.profiles[1]).toMatchObject({ accent: "rose", nicheTerms: ["ok", "#fine"], createdAt: "2026-01-01T00:00:00.000Z" });
  });

  it("writes the repaired data back so it is clean next time", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILES_KEY, JSON.stringify([{ id: "p1", name: "Sam", accent: "neon" }, "junk"]));
    storage.setItem(ACTIVE_PROFILE_KEY, "gone");
    const store = loadProfiles(storage);
    expect(store.activeId).toBe("p1");
    expect(JSON.parse(storage.getItem(PROFILES_KEY)!)).toEqual(store.profiles);
    expect(storage.getItem(ACTIVE_PROFILE_KEY)).toBe("p1");
  });

  it("survives storage that throws", () => {
    expect(loadProfiles(brokenStorage)).toEqual(EMPTY_STORE);
    expect(loadProfiles(null)).toEqual(EMPTY_STORE);
    const { store, profile } = createProfile(EMPTY_STORE, { name: "Sam" }, { storage: brokenStorage, id: "p1" });
    expect(activeProfile(store)).toBe(profile);
    expect(deleteProfile(store, "p1", brokenStorage)).toEqual(EMPTY_STORE);
  });

  it("repairProfile rejects non-objects", () => {
    expect(repairProfile(undefined)).toBeNull();
    expect(repairProfile("Sam")).toBeNull();
    expect(repairProfile({ id: "p1", name: "" })).toBeNull();
  });
});

describe("helpers", () => {
  it("cleanTerms ignores non-arrays and non-strings", () => {
    expect(cleanTerms(undefined)).toEqual([]);
    expect(cleanTerms(["  #Meal Prep  ", 3, null])).toEqual(["#MealPrep"]);
  });

  it("cleanDraft fills every field", () => {
    expect(cleanDraft(null)).toEqual({ ...DEFAULT_DRAFT, name: "" });
  });

  it("appearanceOf falls back to the default look", () => {
    expect(appearanceOf(null)).toEqual({ theme: "system", accent: "violet", density: "comfortable" });
  });
});
