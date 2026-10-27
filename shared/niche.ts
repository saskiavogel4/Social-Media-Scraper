// Niche extraction for handle mode (docs/PRD.md FR-3). Pure, deterministic, no I/O.
//
// HOW IT WORKS, IN PLAIN ENGLISH
// 1. From each of the creator's posts, collect: hashtags (from `hashtags` and the caption),
//    caption words, and two-word caption phrases ("meal prep"). Everything is lowercased.
//    Generic reach-bait tags (#fyp, #viral, #reels...), stopwords, @mentions, URLs, numbers
//    and emoji are thrown away.
// 2. Near-duplicates are merged under one key: "#mealprep", "meal prep" and "#mealpreps"
//    all become "mealprep". The hashtag spelling is shown if the creator ever used it.
// 3. Terms are ranked first by how many different posts they appear in (a theme the creator
//    keeps coming back to), then by a score that lightly favours hashtags, two-word phrases
//    and better-performing posts.
// 4. When picking the top terms, a word already covered by a picked term is skipped
//    (after "#mealprep", plain "meal" adds nothing).

import { MAX_TERM_LENGTH } from "./api.ts";
import type { Video } from "./types.ts";
import {
  NICHE_BIGRAM_BOOST,
  NICHE_ENGAGEMENT_WEIGHT,
  NICHE_HASHTAG_BOOST,
  NICHE_MIN_WORD_LENGTH,
} from "./scoringConfig.ts";

/** Generic hashtags/words that say nothing about the niche. Compared without "#". */
export const NOISE_TAGS: ReadonlySet<string> = new Set([
  "fyp", "fy", "fypage", "fypシ", "foryou", "foryoupage", "foryourpage", "fyppage",
  "viral", "viralvideo", "viralvideos", "viralreels", "goviral", "trending", "trend",
  "trendingnow", "trendy", "reels", "reel", "reelsinstagram", "reelitfeelit", "reelsvideo",
  "instareels", "explore", "explorepage", "explorer", "exploremore", "shorts", "short",
  "ytshorts", "youtubeshorts", "shortsvideo", "shortvideo", "youtube", "youtuber", "tiktok",
  "tiktoker", "tiktokviral", "tiktokers", "tiktokfamous", "instagram", "insta", "instagood",
  "instadaily", "instalike", "photooftheday", "picoftheday", "love", "follow", "followme",
  "followforfollow", "follow4follow", "like", "likes", "like4like", "likeforlikes",
  "likeforfollow", "subscribe", "video", "videos", "capcut", "duet", "stitch", "greenscreen",
  "xyzbca", "blowthisup", "foryoupageofficiall", "4u", "4you", "relatable", "new", "share",
]);

/** Tag patterns that are always noise even if not listed above (#fypツ, #viralpost...). */
const NOISE_PATTERNS: readonly RegExp[] = [/^fyp/, /^foryou/, /viral/, /^4you/];

/** English stopwords plus caption filler that isn't topical. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any",
  "are", "aren", "arent", "as", "at", "be", "because", "been", "before", "being", "below",
  "between", "both", "but", "by", "can", "cant", "could", "couldnt", "did", "didnt", "do",
  "does", "doesnt", "doing", "dont", "down", "during", "each", "even", "ever", "every", "few",
  "for", "from", "further", "get", "gets", "getting", "got", "had", "hadnt", "has", "hasnt",
  "have", "havent", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his",
  "how", "i", "if", "im", "in", "into", "is", "isnt", "it", "its", "itself", "ive", "just",
  "let", "lets", "like", "make", "made", "me", "more", "most", "much", "must", "my", "myself",
  "need", "never", "no", "nor", "not", "now", "of", "off", "on", "once", "one", "only", "or",
  "other", "our", "ours", "ourselves", "out", "over", "own", "really", "same", "she", "should",
  "so", "some", "still", "such", "than", "that", "thats", "the", "their", "theirs", "them",
  "themselves", "then", "there", "theres", "these", "they", "theyre", "thing", "things",
  "this", "those", "through", "to", "too", "under", "until", "up", "us", "very", "was", "wasnt",
  "way", "we", "well", "were", "what", "whats", "when", "where", "which", "while", "who",
  "whom", "why", "will", "with", "wont", "would", "wouldnt", "yet", "you", "youll", "your",
  "youre", "yours", "yourself", "youve", "go", "going", "gonna", "want", "wanna", "know",
  "think", "see", "look", "say", "said", "use", "using", "try", "tried", "best", "good",
  "great", "new", "first", "last", "next", "day", "days", "today", "time", "week", "year",
  "part", "pt", "ep", "episode", "link", "bio", "comment", "comments", "follow", "followers",
  "subscribe", "share", "save", "tag", "dm", "check", "video", "videos", "post", "posts",
  "watch", "here", "lol", "omg", "yes", "yeah", "okay", "ok", "guys", "everyone", "people",
  "who", "many", "lot", "lots", "ways", "tips", "tip", "via", "amp", "pls", "please",
]);

export function isNoiseTag(tag: string): boolean {
  const t = tag.replace(/^#/, "").toLowerCase();
  return NOISE_TAGS.has(t) || NOISE_PATTERNS.some((re) => re.test(t));
}

/** Merge key for near-duplicates: no "#", no spaces/underscores, simple plural "s" removed. */
export function termKey(term: string): string {
  let k = term.toLowerCase().replace(/^#/, "").replace(/[\s_]+/g, "");
  if (k.length > 4 && k.endsWith("s") && !k.endsWith("ss")) k = k.slice(0, -1);
  return k;
}

const HASHTAG_RE = /#([\p{L}\p{M}\p{N}_]+)/gu;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/giu;
const MENTION_RE = /@[\p{L}\p{N}_.]+/gu;
const HAS_LETTER_RE = /\p{L}/u;

function normaliseHashtag(raw: string): string | undefined {
  const body = raw.trim().replace(/^#+/, "").toLowerCase();
  if (body.length < 2 || !HAS_LETTER_RE.test(body)) return undefined;
  if (!/^[\p{L}\p{M}\p{N}_]+$/u.test(body)) return undefined;
  if (isNoiseTag(body)) return undefined;
  return `#${body}`;
}

function isUsefulWord(w: string): boolean {
  return (
    w.length >= NICHE_MIN_WORD_LENGTH &&
    /^\p{L}+$/u.test(w) &&
    !STOPWORDS.has(w) &&
    !isNoiseTag(w)
  );
}

interface PostTerms {
  hashtags: Set<string>;
  words: Set<string>;
  bigrams: Set<string>;
}

/** Pulls hashtags, single words and two-word phrases out of one post. */
export function termsFromPost(video: Video): PostTerms {
  const hashtags = new Set<string>();
  const caption = (video.caption ?? "").toLowerCase();

  for (const raw of video.hashtags ?? []) {
    const tag = normaliseHashtag(String(raw));
    if (tag) hashtags.add(tag);
  }
  for (const m of caption.matchAll(HASHTAG_RE)) {
    const tag = normaliseHashtag(m[1]);
    if (tag) hashtags.add(tag);
  }

  // Remove URLs, mentions and hashtags, leaving a "|" so phrases can't span across them.
  const text = caption
    .replace(URL_RE, " | ")
    .replace(MENTION_RE, " | ")
    .replace(/#[\p{L}\p{M}\p{N}_]+/gu, " | ")
    .replace(/['’]/g, "") // don't -> dont
    .replace(/-/g, " "); // meal-prep -> meal prep

  const words = new Set<string>();
  const bigrams = new Set<string>();
  // Split into phrases at punctuation/emoji/markers; words only pair up within a phrase.
  for (const segment of text.split(/[^\p{L}\p{N}\s]+/u)) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i];
      if (!isUsefulWord(w)) continue;
      words.add(w);
      const next = tokens[i + 1];
      if (next !== undefined && isUsefulWord(next)) bigrams.add(`${w} ${next}`);
    }
  }
  return { hashtags, words, bigrams };
}

interface Candidate {
  key: string;
  posts: Set<number>;
  score: number;
  /** Display form -> weight, so we can show the most common spelling. */
  forms: Map<string, { weight: number; isHashtag: boolean }>;
}

/** Each post weighs 1 .. 1+NICHE_ENGAGEMENT_WEIGHT, by log-views relative to the creator's best. */
function postWeights(videos: Video[]): number[] {
  const logs = videos.map((v) => {
    const views = v.stats?.views;
    return typeof views === "number" && Number.isFinite(views) && views > 0 ? Math.log10(1 + views) : 0;
  });
  const max = Math.max(0, ...logs);
  return logs.map((l) => 1 + NICHE_ENGAGEMENT_WEIGHT * (max > 0 ? l / max : 0));
}

/** True when one key contains the other (only for keys long enough to be meaningful). */
function overlaps(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.includes(short);
}

/**
 * Suggested niche search terms from a creator's own posts, most relevant first.
 * Hashtags keep their leading "#"; everything is lowercase.
 */
export function extractNicheTerms(videos: Video[], max = 5): string[] {
  if (max <= 0 || videos.length === 0) return [];
  const weights = postWeights(videos);
  const candidates = new Map<string, Candidate>();

  const add = (form: string, postIndex: number, boost: number, isHashtag: boolean) => {
    // A suggested term the search API would reject (too long) would fail the whole search.
    if (form.length > MAX_TERM_LENGTH) return;
    const key = termKey(form);
    if (key.length < 2) return;
    let c = candidates.get(key);
    if (!c) {
      c = { key, posts: new Set(), score: 0, forms: new Map() };
      candidates.set(key, c);
    }
    const w = weights[postIndex] * boost;
    // A key counts once per post (its best form), so "#mealprep" + "meal prep" in the same
    // caption isn't double-counted.
    if (!c.posts.has(postIndex)) {
      c.posts.add(postIndex);
      c.score += w;
    }
    const f = c.forms.get(form) ?? { weight: 0, isHashtag };
    f.weight += w;
    c.forms.set(form, f);
  };

  videos.forEach((video, i) => {
    const { hashtags, words, bigrams } = termsFromPost(video);
    // Hashtags first so their (higher) boost is the one counted for the post.
    for (const t of hashtags) add(t, i, NICHE_HASHTAG_BOOST, true);
    for (const b of bigrams) add(b, i, NICHE_BIGRAM_BOOST, false);
    for (const w of words) add(w, i, 1, false);
  });

  const ranked = [...candidates.values()].sort(
    (a, b) =>
      b.posts.size - a.posts.size ||
      b.score - a.score ||
      b.key.length - a.key.length ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );

  const picked: Candidate[] = [];
  for (const c of ranked) {
    if (picked.length >= max) break;
    if (picked.some((p) => overlaps(p.key, c.key))) continue;
    picked.push(c);
  }
  return picked.map(displayForm);
}

/** Prefer a hashtag spelling if the creator used one, then the heaviest, then alphabetical. */
function displayForm(c: Candidate): string {
  const forms = [...c.forms.entries()].sort(
    ([fa, a], [fb, b]) =>
      Number(b.isHashtag) - Number(a.isHashtag) ||
      b.weight - a.weight ||
      (fa < fb ? -1 : fa > fb ? 1 : 0),
  );
  return forms[0][0];
}
