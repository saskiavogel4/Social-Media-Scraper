// Defensive helpers shared by the platform adapters.
// Scrape Creators responses are untyped JSON, so every value is treated as optional
// and of unknown type. Getters return `undefined` instead of throwing or defaulting to 0.

import type { Video } from "../../../shared/types.ts";

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Safe deep getter: get(obj, "a", 0, "b") reads obj.a[0].b without throwing. */
export function get(value: unknown, ...path: (string | number)[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (!isRecord(current)) return undefined;
      current = current[key];
    }
  }
  return current;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Non-empty trimmed string. Finite numbers are stringified (ids are sometimes numeric). */
export function str(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** First argument that is a non-empty string. */
export function firstStr(...values: unknown[]): string | undefined {
  for (const value of values) {
    const s = str(value);
    if (s !== undefined) return s;
  }
  return undefined;
}

/**
 * Parses a human-readable count: "1,234", "13,798,774 views", "1.2M views", "750K",
 * "2.75M subscribers". Returns undefined when there is no number in the text.
 */
export function parseCount(text: string): number | undefined {
  const match = /(\d[\d,.\s]*)\s*([KMB])?\b/i.exec(text.replace(/\u00a0/g, " "));
  if (!match) return undefined;
  const suffix = match[2]?.toUpperCase();
  let digits = match[1].replace(/\s/g, "");
  if (suffix) {
    // "1.2M" / "1,2M": treat the separator as a decimal point.
    digits = digits.replace(",", ".");
  } else {
    // "1,234,567" / "1.234.567": separators are thousands separators.
    digits = digits.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  }
  const base = Number.parseFloat(digits);
  if (!Number.isFinite(base)) return undefined;
  const multiplier = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return Math.round(base * multiplier);
}

/** A non-negative count from a number or a count-like string; otherwise undefined. */
export function num(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value === "string") return parseCount(value);
  return undefined;
}

/** First argument that parses as a count. */
export function firstNum(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n = num(value);
    if (n !== undefined) return n;
  }
  return undefined;
}

/**
 * Follower counts of 0 are treated as unknown: TikTok search payloads return
 * `follower_count: 0` for authors who clearly have followers, and 0 is useless for
 * the outperformance signal (views / followers) anyway.
 */
export function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

/**
 * Converts unix seconds, unix milliseconds or a date string to ISO 8601.
 * Returns undefined for anything unparseable or non-positive.
 */
export function toIso(value: unknown): string | undefined {
  let date: Date | undefined;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    date = new Date(value > 1e12 ? value : value * 1000);
  } else if (typeof value === "string" && value.trim() !== "") {
    const trimmed = value.trim();
    date = /^\d+$/.test(trimmed) ? new Date(toMs(Number(trimmed))) : new Date(trimmed);
  }
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function toMs(n: number): number {
  return n > 1e12 ? n : n * 1000;
}

/** "4:14" -> 254, "00:00:19" -> 19, "1:02:03" -> 3723. */
export function clockToSeconds(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(:\d{1,2}){1,2}$/.test(value.trim())) return undefined;
  return value
    .trim()
    .split(":")
    .reduce((total, part) => total * 60 + Number(part), 0);
}

const HASHTAG = /#([\p{L}\p{N}_]+)/gu;

/** Lower-cased hashtags (without "#"), de-duplicated, from explicit lists and free text. */
export function collectHashtags(explicit: unknown[], ...texts: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const add = (tag: string | undefined) => {
    const clean = tag?.replace(/^#/, "").trim().toLowerCase();
    if (clean) seen.add(clean);
  };
  for (const tag of explicit) add(str(tag));
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(HASHTAG)) add(match[1]);
  }
  return [...seen];
}

/**
 * Turns a WebVTT (or plain) transcript into plain text: drops the WEBVTT header,
 * NOTE/STYLE blocks, cue ids, timing lines and inline tags, then joins the cue text.
 */
export function vttToText(input: string): string {
  const text = input.replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
  if (!/^\uFEFF?WEBVTT/.test(text.trimStart()) && !text.includes("-->")) {
    return text.replace(/\s+/g, " ").trim();
  }
  const lines: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const blockLines = block.split("\n").map((l) => l.trim());
    const head = blockLines[0] ?? "";
    if (/^\uFEFF?WEBVTT/.test(head) || /^(NOTE|STYLE|REGION)\b/.test(head)) continue;
    for (const line of blockLines) {
      if (line === "" || line.includes("-->") || /^\d+$/.test(line)) continue;
      lines.push(line.replace(/<[^>]+>/g, ""));
    }
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/** Strip a leading "@" and surrounding whitespace from a handle. */
export function cleanHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

/** Keeps the first occurrence of each video id (platforms may return duplicates). */
export function uniqueById(videos: Video[]): Video[] {
  const seen = new Set<string>();
  return videos.filter((video) => {
    if (seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  });
}

/** Maps raw items through a normaliser, dropping items it rejects (null) and duplicates. */
export function normaliseAll(items: unknown[], normalise: (raw: unknown) => Video | null): Video[] {
  const out: Video[] = [];
  for (const item of items) {
    const video = normalise(item);
    if (video) out.push(video);
  }
  return uniqueById(out);
}
