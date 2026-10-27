// TikTok adapter: Scrape Creators -> shared Video model.
//
// Docs verified 2026-10-27 (docs.scrapecreators.com, example responses -> fixtures/tiktok-*.json):
// - GET /v1/tiktok/get-trending-feed   params: region (REQUIRED, e.g. "US"), trim.            1 credit.
//     -> { aweme_list: Aweme[] }  (may include photo posts: `image_post_info`, url ".../photo/<id>")
// - GET /v1/tiktok/search/keyword      params: query (required), date_posted (yesterday|this-week|
//     this-month|last-3-months|last-6-months|all-time), sort_by (relevance|most-liked|date-posted),
//     region, trim, cursor.                                                                     1 credit.
//     -> { search_item_list: [{ aweme_info: Aweme }], cursor }
// - GET /v1/tiktok/search/top          params: query (required), publish_time, sort_by, region,
//     cursor.                                                                                   1 credit.
//     -> { items: TopItem[] }  NOT USED: docs say Top returns "videos and photo carousels;
//     keyword search returns videos only". Same price, so keyword search is the better fit for a
//     video-trend tool (fewer wasted results), and it also offers `trim`.
// - GET /v1/tiktok/search/hashtag      params: hashtag (required, without "#"), region, trim,
//     cursor.                                                                                   1 credit.
//     -> { aweme_list: Aweme[], cursor, has_more }
// - GET /v3/tiktok/profile/videos      params: handle (required) | user_id, sort_by (latest|popular),
//     region, include_pinned, trim, max_cursor.                                                 1 credit.
//     -> { aweme_list: Aweme[], max_cursor, has_more }  (aweme.author.follower_count is populated)
// - GET /v1/tiktok/profile             params: handle | user_id, cache_max_age.                1 credit.
//     -> { user: { uniqueId, nickname, avatarThumb, ... }, stats: { followerCount, ... } }
// - GET /v1/tiktok/video/transcript    params: url (required), language, use_ai_as_fallback,
//     allow_long_transcription. Native captions: 1 credit; no transcript: 0 credits; AI modes
//     cost more and are NOT enabled here.
//     -> { transcript: "WEBVTT\n\n00:00:00.120 --> ...", transcript_with_timestamp: [...] | null }
//
// Aweme fields used: aweme_id (TopItem: id), desc, create_time (unix seconds; TopItem: ISO string),
// create_time_utc, url, share_url, content_type, image_post_info, statistics.{play_count,
// digg_count, comment_count, share_count}, author.{unique_id, nickname, follower_count,
// avatar_thumb|avatar_medium.url_list}, video.{cover|origin_cover|dynamic_cover}.url_list,
// video.duration (milliseconds), music.title, text_extra[].hashtag_name.
//
// Note: the documented examples' `url` field sometimes points at a different video than
// `aweme_id`, so the canonical URL is always rebuilt from author.unique_id + aweme_id, and `url` /
// `share_url` are only trusted when they contain the same id.

import type { Video } from "../../../shared/types.ts";
import type { PlatformAdapter, ProfileWithPosts, ScFetch } from "./types.ts";
import {
  asArray,
  cleanHandle,
  collectHashtags,
  firstNum,
  firstStr,
  get,
  isRecord,
  normaliseAll,
  num,
  positive,
  str,
  toIso,
  vttToText,
} from "./util.ts";

const TRENDING_REGION = "US";
const POST_URL = /tiktok\.com\/@([^/?#]+)\/(video|photo)\/(\d+)/;

function isPhotoPost(raw: Record<string, unknown>, id: string): boolean {
  if (isRecord(raw.image_post_info)) return true;
  const contentType = str(raw.content_type);
  if (contentType !== undefined && contentType !== "video") return true;
  for (const candidate of [raw.url, raw.share_url]) {
    const match = typeof candidate === "string" ? POST_URL.exec(candidate) : null;
    if (match && match[3] === id && match[2] === "photo") return true;
  }
  return false;
}

/** Reads the handle out of `url` / `share_url`, but only if the link is for this same post. */
function handleFromUrls(raw: Record<string, unknown>, id: string): string | undefined {
  for (const candidate of [raw.url, raw.share_url]) {
    const match = typeof candidate === "string" ? POST_URL.exec(candidate) : null;
    if (match && match[3] === id) return decodeURIComponent(match[1]);
  }
  return undefined;
}

/** Normalises one TikTok "aweme" (or Top-search item, or `{ aweme_info }` wrapper). */
export function normaliseTikTok(input: unknown): Video | null {
  const raw = isRecord(get(input, "aweme_info")) ? get(input, "aweme_info") : input;
  if (!isRecord(raw)) return null;

  const id = firstStr(raw.aweme_id, raw.id, get(raw, "statistics", "aweme_id"));
  if (!id || !/^\d+$/.test(id)) return null;
  if (isPhotoPost(raw, id)) return null;

  const author = isRecord(raw.author) ? raw.author : {};
  const handle = firstStr(author.unique_id) ?? handleFromUrls(raw, id);
  if (!handle) return null; // cannot build a working link without the handle

  const caption = firstStr(raw.desc) ?? "";
  const durationMs = num(get(raw, "video", "duration"));

  return {
    id,
    platform: "tiktok",
    url: `https://www.tiktok.com/@${handle}/video/${id}`,
    thumbnailUrl:
      firstStr(
        get(raw, "video", "cover", "url_list", 0),
        get(raw, "video", "origin_cover", "url_list", 0),
        get(raw, "video", "dynamic_cover", "url_list", 0),
      ) ?? "",
    caption,
    hashtags: collectHashtags(
      asArray(raw.text_extra).map((t) => get(t, "hashtag_name")),
      caption,
    ),
    author: {
      handle,
      displayName: firstStr(author.nickname),
      followers: positive(num(author.follower_count)),
      avatarUrl: firstStr(
        get(author, "avatar_thumb", "url_list", 0),
        get(author, "avatar_medium", "url_list", 0),
      ),
    },
    stats: {
      views: num(get(raw, "statistics", "play_count")),
      likes: num(get(raw, "statistics", "digg_count")),
      comments: num(get(raw, "statistics", "comment_count")),
      shares: num(get(raw, "statistics", "share_count")),
    },
    postedAt: toIso(raw.create_time) ?? toIso(raw.create_time_utc),
    durationSec: durationMs ? Math.round(durationMs / 1000) : undefined,
    soundName: firstStr(get(raw, "music", "title")),
    trendScore: 0,
  };
}

export const tiktokAdapter: PlatformAdapter = {
  platform: "tiktok",

  async trending(sc: ScFetch): Promise<Video[]> {
    const res = await sc("/v1/tiktok/get-trending-feed", { region: TRENDING_REGION });
    return normaliseAll(asArray(get(res, "aweme_list")), normaliseTikTok);
  },

  async search(sc: ScFetch, term: string): Promise<Video[]> {
    const trimmed = term.trim();
    if (trimmed.startsWith("#")) {
      const hashtag = trimmed.replace(/^#+/, "").trim();
      if (!hashtag) return [];
      const res = await sc("/v1/tiktok/search/hashtag", { hashtag });
      return normaliseAll(asArray(get(res, "aweme_list")), normaliseTikTok);
    }
    if (!trimmed) return [];
    const res = await sc("/v1/tiktok/search/keyword", { query: trimmed });
    return normaliseAll(asArray(get(res, "search_item_list")), normaliseTikTok);
  },

  async profile(sc: ScFetch, handle: string): Promise<ProfileWithPosts> {
    const wanted = cleanHandle(handle);
    // 1 credit: recent videos. Their author object usually carries follower_count too.
    const videosRes = await sc("/v3/tiktok/profile/videos", { handle: wanted });
    const videos = normaliseAll(asArray(get(videosRes, "aweme_list")), normaliseTikTok);
    const own = videos.filter((v) => v.author.handle.toLowerCase() === wanted.toLowerCase());
    let followers = own.map((v) => v.author.followers).find((f) => f !== undefined);
    let resolvedHandle = own[0]?.author.handle ?? wanted;

    // +1 credit only when the videos didn't tell us the follower count.
    if (followers === undefined) {
      const profileRes = await sc("/v1/tiktok/profile", { handle: wanted });
      followers = positive(firstNum(get(profileRes, "stats", "followerCount")));
      resolvedHandle = firstStr(get(profileRes, "user", "uniqueId")) ?? resolvedHandle;
    }

    for (const video of own) video.author.followers ??= followers;
    return { handle: resolvedHandle, followers, videos };
  },

  async transcript(sc: ScFetch, videoUrl: string): Promise<string | null> {
    const res = await sc("/v1/tiktok/video/transcript", { url: videoUrl });
    const raw = get(res, "transcript");
    if (typeof raw === "string") {
      const text = vttToText(raw);
      if (text) return text;
    }
    const segments = asArray(get(res, "transcript_with_timestamp"))
      .map((s) => str(get(s, "text")))
      .filter((s): s is string => s !== undefined);
    const joined = segments.join(" ").replace(/\s+/g, " ").trim();
    return joined || null;
  },
};
