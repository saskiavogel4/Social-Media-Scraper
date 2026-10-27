// Trend Score, result filtering and de-duplication. Pure functions, no I/O.
// See docs/PRD.md §6.4 and the constants (with explanations) in scoringConfig.ts.
//
// THE FORMULA, IN PLAIN ENGLISH
// Each video gets up to three sub-scores between 0 and 1:
//   1. Engagement: (likes + comments + shares) / views, on a straight line from 0% to 15%
//      (15% or more = 1). Skipped if the video has fewer than 100 views or no
//      like/comment/share counts at all.
//   2. Velocity: views per hour since it was posted, on a log scale from 10/h (0) to
//      100,000/h (1). Skipped if views or the post date are unknown.
//   3. Outperformance: views / author followers, on a log scale from 0.1x (0) to 100x (1).
//      Skipped if views or followers are unknown.
// The Trend Score is the weighted average of the sub-scores that exist (missing ones
// are left out and the remaining weights renormalised), times a mild confidence factor
// for whatever weight was missing, scaled to an integer 0–100.
//
// The curves are fixed absolute scales, not "best in this batch", so a video's score
// doesn't change depending on what else was fetched alongside it, which keeps cached
// results and mixed-platform lists comparable.

import type { TimeWindow } from "./api.ts";
import type { Video } from "./types.ts";
import {
  ENGAGEMENT_MIN_VIEWS,
  ENGAGEMENT_RATE_CAP,
  FUTURE_TOLERANCE_HOURS,
  MISSING_SIGNAL_PENALTY,
  NO_SIGNAL_SCORE,
  OUTPERFORMANCE_CEILING_RATIO,
  OUTPERFORMANCE_FLOOR_RATIO,
  OUTPERFORMANCE_MIN_FOLLOWERS,
  SCORE_WEIGHTS,
  TIME_WINDOW_HOURS,
  VELOCITY_CEILING_PER_HOUR,
  VELOCITY_FLOOR_PER_HOUR,
  VELOCITY_MIN_AGE_HOURS,
  type ScoreSignal,
} from "./scoringConfig.ts";

const MS_PER_HOUR = 3_600_000;

/** A finite, non-negative number, or undefined. Treats NaN/negative/strings-in-disguise as missing. */
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Position of `value` between `floor` and `ceiling` on a log10 scale, clamped to 0..1. */
function logScale(value: number, floor: number, ceiling: number): number {
  if (value <= 0) return 0;
  return clamp01((Math.log10(value) - Math.log10(floor)) / (Math.log10(ceiling) - Math.log10(floor)));
}

/** Parse postedAt to epoch ms, or undefined if missing/unparseable. */
function postedAtMs(video: Video): number | undefined {
  if (!video.postedAt) return undefined;
  const ms = Date.parse(video.postedAt);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * (likes + comments + shares) / views. Counts that are missing are left out of the sum
 * (e.g. YouTube often has no shares). Returns undefined when views are missing or 0,
 * or when none of likes/comments/shares are known.
 */
export function engagementRate(video: Video): number | undefined {
  const views = count(video.stats?.views);
  if (views === undefined || views === 0) return undefined;
  const parts = [video.stats.likes, video.stats.comments, video.stats.shares]
    .map(count)
    .filter((n): n is number => n !== undefined);
  if (parts.length === 0) return undefined;
  return parts.reduce((a, b) => a + b, 0) / views;
}

/**
 * Hours since posting, floored at VELOCITY_MIN_AGE_HOURS. Small future offsets (clock skew)
 * count as "just posted"; dates further in the future than FUTURE_TOLERANCE_HOURS are bad
 * data and return undefined.
 */
function ageHours(video: Video, now: Date): number | undefined {
  const posted = postedAtMs(video);
  if (posted === undefined) return undefined;
  const hours = (now.getTime() - posted) / MS_PER_HOUR;
  if (hours < -FUTURE_TOLERANCE_HOURS) return undefined;
  return Math.max(VELOCITY_MIN_AGE_HOURS, hours);
}

export type SignalScores = Partial<Record<ScoreSignal, number>>;

/** The individual 0..1 sub-scores for a video. A signal is absent when its inputs are missing. */
export function signalScores(video: Video, now: Date = new Date()): SignalScores {
  const out: SignalScores = {};
  const views = count(video.stats?.views);

  const er = engagementRate(video);
  if (er !== undefined && views !== undefined && views >= ENGAGEMENT_MIN_VIEWS) {
    out.engagement = clamp01(er / ENGAGEMENT_RATE_CAP);
  }

  const age = ageHours(video, now);
  if (views !== undefined && age !== undefined) {
    out.velocity = logScale(views / age, VELOCITY_FLOOR_PER_HOUR, VELOCITY_CEILING_PER_HOUR);
  }

  const followers = count(video.author?.followers);
  if (views !== undefined && followers !== undefined) {
    const ratio = views / Math.max(followers, OUTPERFORMANCE_MIN_FOLLOWERS);
    out.outperformance = logScale(ratio, OUTPERFORMANCE_FLOOR_RATIO, OUTPERFORMANCE_CEILING_RATIO);
  }

  return out;
}

/** Trend Score (integer 0–100) for a single video. */
export function trendScore(video: Video, now: Date = new Date()): number {
  const signals = signalScores(video, now);
  const allSignals = Object.keys(SCORE_WEIGHTS) as ScoreSignal[];
  const totalWeight = allSignals.reduce((sum, s) => sum + SCORE_WEIGHTS[s], 0);

  let usedWeight = 0;
  let weighted = 0;
  for (const s of allSignals) {
    const value = signals[s];
    if (value === undefined) continue;
    usedWeight += SCORE_WEIGHTS[s];
    weighted += SCORE_WEIGHTS[s] * value;
  }
  if (usedWeight === 0) return NO_SIGNAL_SCORE;

  const average = weighted / usedWeight;
  const missingShare = 1 - usedWeight / totalWeight;
  const confidence = 1 - MISSING_SIGNAL_PENALTY * missingShare;
  return Math.round(clamp01(average * confidence) * 100);
}

/** Deterministic ordering: score desc, then views desc, then platform/id so ties are stable. */
function compareScored(a: Video, b: Video): number {
  if (b.trendScore !== a.trendScore) return b.trendScore - a.trendScore;
  const av = count(a.stats?.views) ?? -1;
  const bv = count(b.stats?.views) ?? -1;
  if (bv !== av) return bv - av;
  const ak = `${a.platform}:${a.id}`;
  const bk = `${b.platform}:${b.id}`;
  return ak < bk ? -1 : ak > bk ? 1 : 0;
}

/**
 * Returns new Video objects with trendScore set, sorted by trendScore descending.
 * Does not mutate the input.
 */
export function scoreVideos(videos: Video[], now: Date = new Date()): Video[] {
  return videos.map((v) => ({ ...v, trendScore: trendScore(v, now) })).sort(compareScored);
}

/**
 * Applies the time window and minimum-views filters.
 * - Videos with an unknown or unparseable postedAt are KEPT for every window: some
 *   endpoints omit dates, and dropping them would silently empty whole platforms. They
 *   also score lower (no velocity signal), so they sink rather than vanish.
 * - Videos dated in the future (clock skew) are kept.
 * - Videos with unknown views are kept only when minViews is 0/undefined.
 */
export function filterVideos(
  videos: Video[],
  opts: { window: TimeWindow; minViews?: number },
  now: Date = new Date(),
): Video[] {
  const windowHours = TIME_WINDOW_HOURS[opts.window] ?? null;
  const minViews = opts.minViews && opts.minViews > 0 ? opts.minViews : 0;
  const cutoff = windowHours === null ? null : now.getTime() - windowHours * MS_PER_HOUR;

  return videos.filter((v) => {
    if (cutoff !== null) {
      const posted = postedAtMs(v);
      if (posted !== undefined && posted < cutoff) return false;
    }
    if (minViews > 0) {
      const views = count(v.stats?.views);
      if (views === undefined || views < minViews) return false;
    }
    return true;
  });
}

/** Removes duplicates by platform + id, keeping the first occurrence and the input order. */
export function dedupeVideos(videos: Video[]): Video[] {
  const seen = new Set<string>();
  const out: Video[] = [];
  for (const v of videos) {
    const key = `${v.platform}:${v.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
