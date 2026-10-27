// Every tunable number behind the Trend Score, the result filters and niche extraction.
// See docs/PRD.md §6.4. Change values here, not in scoring.ts / niche.ts, and update
// the worked examples in scoring.test.ts when you do.

import type { TimeWindow } from "./api.ts";

/**
 * How much each signal contributes to the Trend Score. They don't have to add up to 1:
 * the score uses weight / (sum of weights of the signals that are actually available),
 * so missing signals are left out and the rest are renormalised.
 *
 * Velocity and outperformance are weighted above raw engagement because, for a creator
 * hunting ideas, "a small account blowing up right now" is the most copyable signal.
 */
export const SCORE_WEIGHTS = {
  /** (likes + comments + shares) / views. Tells you the audience actually cared. */
  engagement: 0.3,
  /** Views per hour since posting. Fresh videos gaining views fast get boosted. */
  velocity: 0.35,
  /** Views / author followers. A video reaching far beyond its own audience. */
  outperformance: 0.35,
} as const;

export type ScoreSignal = keyof typeof SCORE_WEIGHTS;

/**
 * Engagement rate that counts as "maxed out" (sub-score 1.0). Typical short-form
 * videos sit at 2–8%; 15%+ is exceptional. Scale is linear from 0 up to this cap.
 */
export const ENGAGEMENT_RATE_CAP = 0.15;

/**
 * Below this many views the engagement rate is too noisy to trust
 * (10 views + 5 likes = 50%), so the engagement signal is treated as missing.
 */
export const ENGAGEMENT_MIN_VIEWS = 100;

/**
 * Velocity uses a log10 curve between these two points (views per hour):
 * at or below FLOOR -> 0, at or above CEILING -> 1. Every 10x in speed adds 0.25.
 * Examples: 1M views in 24h ≈ 41.7k/h -> 0.90; 1M views in 30 days ≈ 1.4k/h -> 0.54.
 */
export const VELOCITY_FLOOR_PER_HOUR = 10;
export const VELOCITY_CEILING_PER_HOUR = 100_000;

/**
 * Age is never taken as less than this many hours, so a video posted 2 minutes ago
 * with 500 views doesn't look like it's doing 15,000 views/hour.
 */
export const VELOCITY_MIN_AGE_HOURS = 1;

/**
 * postedAt dates more than this far in the future are treated as bad data (velocity is
 * skipped). Smaller future offsets are assumed to be clock skew and treated as "just posted".
 */
export const FUTURE_TOLERANCE_HOURS = 24;

/**
 * Outperformance uses a log10 curve on views / followers:
 * ratio 0.1 (a big account's ordinary post) -> 0, ratio 1 -> 0.33, 10 -> 0.67, 100+ -> 1.
 */
export const OUTPERFORMANCE_FLOOR_RATIO = 0.1;
export const OUTPERFORMANCE_CEILING_RATIO = 100;

/**
 * Follower counts below this are raised to this value before dividing, so a brand-new
 * account (0 or 3 followers) can't produce an absurd ratio from a handful of views.
 */
export const OUTPERFORMANCE_MIN_FOLLOWERS = 100;

/**
 * Mild confidence penalty for missing data. The final score is multiplied by
 * (1 - MISSING_SIGNAL_PENALTY * share of total weight that was missing).
 * With 0.2: missing followers only (0.35 of the weight) -> x0.93. This keeps a video
 * that only has one great number from outranking a video that is great on all three.
 */
export const MISSING_SIGNAL_PENALTY = 0.2;

/** Score for a video with no usable signal at all (e.g. no view count). Sorts to the bottom. */
export const NO_SIGNAL_SCORE = 0;

// ---------------------------------------------------------------------------
// Result filter defaults (FR-4)
// ---------------------------------------------------------------------------

/** Default time window: last 7 days balances "fresh" against having enough results. */
export const DEFAULT_TIME_WINDOW: TimeWindow = "7d";

/** Default minimum views: 0 = no floor. The Trend Score already demotes tiny videos. */
export const DEFAULT_MIN_VIEWS = 0;

/** Length of each time window in hours. "any" has no limit. */
export const TIME_WINDOW_HOURS: Record<TimeWindow, number | null> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  any: null,
};

// ---------------------------------------------------------------------------
// Niche extraction (handle mode, FR-3)
// ---------------------------------------------------------------------------

/**
 * Light engagement weighting: each post counts as 1 + this * (its log-views relative to
 * the creator's best post). 0.5 means the creator's best post counts at most 1.5x a dud.
 * Only used to break ties between terms that appear in the same number of posts.
 */
export const NICHE_ENGAGEMENT_WEIGHT = 0.5;

/** Hashtags are chosen deliberately by the creator, so they count a bit more than caption words. */
export const NICHE_HASHTAG_BOOST = 1.5;

/** Two-word phrases ("meal prep") are more specific than single words, so they get a small boost. */
export const NICHE_BIGRAM_BOOST = 1.2;

/** Caption words shorter than this are ignored. */
export const NICHE_MIN_WORD_LENGTH = 3;
