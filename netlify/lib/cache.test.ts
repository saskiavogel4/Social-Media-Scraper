import { describe, expect, it, vi } from "vitest";
import { BlobCache, FallbackCache, MemoryCache, type BlobStoreLike } from "./cache.ts";

function fakeStore(): BlobStoreLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    setJSON: async (key, value) => void data.set(key, JSON.parse(JSON.stringify(value))),
    delete: async (key) => void data.delete(key),
  };
}

describe("MemoryCache", () => {
  it("returns values until they expire", async () => {
    let now = 0;
    const cache = new MemoryCache({ now: () => now });
    await cache.set("k", { a: 1 }, 1000);
    expect(await cache.get("k")).toEqual({ a: 1 });
    now = 1000;
    expect(await cache.get("k")).toBeUndefined();
  });

  it("bounds its size", async () => {
    const cache = new MemoryCache({ maxEntries: 2 });
    await cache.set("a", 1, 1000);
    await cache.set("b", 2, 1000);
    await cache.set("c", 3, 1000);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("c")).toBe(3);
  });
});

describe("BlobCache", () => {
  it("stores {expiresAt, data} under a hashed key and honours expiry", async () => {
    let now = 100;
    const store = fakeStore();
    const cache = new BlobCache(store, { now: () => now });
    await cache.set("sc:v1:/v1/x?q=1", [1, 2], 50);
    const [[key, value]] = [...store.data.entries()];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(value).toEqual({ expiresAt: 150, data: [1, 2] });
    expect(await cache.get("sc:v1:/v1/x?q=1")).toEqual([1, 2]);
    now = 150;
    expect(await cache.get("sc:v1:/v1/x?q=1")).toBeUndefined();
    expect(store.data.size).toBe(0);
  });

  it("ignores malformed entries", async () => {
    const store = fakeStore();
    const cache = new BlobCache(store);
    await cache.set("k", 1, 1000);
    const [key] = store.data.keys();
    store.data.set(key, "garbage");
    expect(await cache.get("k")).toBeUndefined();
  });
});

describe("FallbackCache", () => {
  it("falls back to memory when the primary cannot be created", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new FallbackCache(() => {
      throw new Error("MissingBlobsEnvironmentError");
    }, new MemoryCache());
    await cache.set("k", "v", 1000);
    expect(await cache.get("k")).toBe("v");
  });

  it("falls back to memory when the primary throws at runtime", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { get: vi.fn().mockRejectedValue(new Error("x")), set: vi.fn().mockRejectedValue(new Error("x")) };
    const cache = new FallbackCache(broken, new MemoryCache());
    await cache.set("k", "v", 1000);
    expect(await cache.get("k")).toBe("v");
  });
});
