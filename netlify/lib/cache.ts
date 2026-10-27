// Small key/value cache with TTL. Production uses Netlify Blobs; tests and local runs
// without a Netlify context fall back to an in-memory map instead of failing requests.

import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

export interface Cache {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
}

interface Entry {
  expiresAt: number;
  data: unknown;
}

function isEntry(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && typeof (value as Entry).expiresAt === "number" && "data" in value;
}

export class MemoryCache implements Cache {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(opts: { now?: () => number; maxEntries?: number } = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? 500;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      // Evict the oldest insertion to bound memory.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { expiresAt: this.now() + ttlMs, data: value });
  }
}

/** Minimal subset of the Netlify Blobs Store API we use (makes testing easy). */
export interface BlobStoreLike {
  get(key: string, opts: { type: "json" }): Promise<unknown>;
  setJSON(key: string, data: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

/** Blob keys are hashed so arbitrary params never hit key-length/charset limits. */
function blobKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export class BlobCache implements Cache {
  private readonly store: BlobStoreLike;
  private readonly now: () => number;

  constructor(store: BlobStoreLike, opts: { now?: () => number } = {}) {
    this.store = store;
    this.now = opts.now ?? Date.now;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const k = blobKey(key);
    const entry = await this.store.get(k, { type: "json" });
    if (!isEntry(entry)) return undefined;
    if (entry.expiresAt <= this.now()) {
      await this.store.delete(k).catch(() => undefined);
      return undefined;
    }
    return entry.data as T;
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    const entry: Entry = { expiresAt: this.now() + ttlMs, data: value };
    await this.store.setJSON(blobKey(key), entry);
  }
}

/**
 * Uses the primary cache and switches to the fallback after the first failure
 * (e.g. Blobs unavailable outside Netlify). Never throws.
 */
export class FallbackCache implements Cache {
  private primary: Cache | undefined;
  private readonly fallback: Cache;
  private readonly name: string;

  constructor(primary: (() => Cache) | Cache, fallback: Cache, name = "cache") {
    this.fallback = fallback;
    this.name = name;
    try {
      this.primary = typeof primary === "function" ? primary() : primary;
    } catch (err) {
      this.disable(err);
    }
  }

  private disable(err: unknown): void {
    const errName = err instanceof Error ? err.name : "Error";
    console.warn(`${this.name}: Netlify Blobs unavailable (${errName}); using in-memory fallback.`);
    this.primary = undefined;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.primary) {
      try {
        return await this.primary.get<T>(key);
      } catch (err) {
        this.disable(err);
      }
    }
    try {
      return await this.fallback.get<T>(key);
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (this.primary) {
      try {
        await this.primary.set(key, value, ttlMs);
        return;
      } catch (err) {
        this.disable(err);
      }
    }
    try {
      await this.fallback.set(key, value, ttlMs);
    } catch {
      // Caching is best-effort.
    }
  }
}

// In-memory fallbacks live for the lifetime of a warm function instance.
const memoryFallbacks = new Map<string, MemoryCache>();

/**
 * Returns a cache backed by the named Netlify Blobs store, falling back to memory if
 * Blobs is unavailable. Call once per request: the Blobs context is per invocation.
 * `strong` consistency is used for counters (rate limits).
 */
export function getCache(storeName: string, opts: { strong?: boolean } = {}): Cache {
  let memory = memoryFallbacks.get(storeName);
  if (!memory) {
    memory = new MemoryCache();
    memoryFallbacks.set(storeName, memory);
  }
  return new FallbackCache(
    () => new BlobCache(getStore({ name: storeName, consistency: opts.strong ? "strong" : "eventual" })),
    memory,
    storeName,
  );
}

/** Test helper: forget in-memory fallback data. */
export function resetMemoryCaches(): void {
  memoryFallbacks.clear();
}
