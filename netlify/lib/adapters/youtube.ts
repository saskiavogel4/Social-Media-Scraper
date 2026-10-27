// YouTube Shorts adapter: Scrape Creators -> shared Video model.
//
// Docs verified 2026-10-27 (docs.scrapecreators.com, example responses -> fixtures/youtube-*.json):
// - GET /v1/youtube/shorts/trending    no query params. ~48 trending Shorts per call.          1 credit.
//     -> { shorts: [{ id, url, title, description, thumbnail, viewCountInt, viewCountText,
//          likeCountInt, likeCountText, commentCountInt, commentCountText, publishDate (ISO),
//          durationMs, durationFormatted, keywords[], channel: { id, url, handle, title } }] }
// - GET /v1/youtube/search             params: query (required), uploadDate (today|this_week|
//     this_month|this_year), sortBy (relevance|popular), type (videos|shorts|channels|playlists),
//     duration (videos only), region, includeExtras, continuationToken.                       1 credit.
//     -> { videos[], shorts[], shelves[{ items[] }], channels[], playlists[], lives[],
//          continuationToken }. Items: { type: "video"|"short", id, url, title, thumbnail,
//          channel: { id, title, handle, thumbnail }, viewCountText, viewCountInt,
//          publishedTime (ISO, approximated from "2 years ago"), lengthText, lengthSeconds }
//     We send type=shorts. Likes/comments are only included with includeExtras (slower), so
//     they are left undefined for search results.
// - GET /v1/youtube/search/hashtag     params: hashtag (required), type (all|shorts),
//     continuationToken.                                                                       1 credit.
//     -> { videos: [same item shape as search, plus description], continuationToken }
//     We send type=shorts.
// - GET /v1/youtube/channel            params: channelId | handle | url, cache_max_age.        1 credit.
//     -> { channelId, channel (URL), name, avatar.image.sources[].url, subscriberCount,
//          subscriberCountText, ... }
// - GET /v1/youtube/channel/shorts     params: handle | channelId, sort (newest|popular),
//     continuationToken.                                                                       1 credit.
//     -> { shorts: [{ type: "short", id, url, title, thumbnail, viewCountInt, likeCountInt,
//          commentCountInt, description, publishDate, durationMs }] }  (no channel object)
// - GET /v1/youtube/video/transcript   params: url (required; video or Short URL), language,
//     original_audio, cache_max_age. Returned transcript: 1 credit; none: null at no charge.
//     -> { transcript: [{ text, startMs, endMs, startTimeText }], transcript_only_text, language }
//
// The canonical link is always https://www.youtube.com/shorts/<id> (the API returns watch?v= URLs).

import type { Video } from "../../../shared/types.ts";
import type { PlatformAdapter, ProfileWithPosts, ScFetch } from "./types.ts";
import {
  asArray,
  cleanHandle,
  clockToSeconds,
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
} from "./util.ts";

/** Shorts are at most 3 minutes; anything longer in a mixed list is a regular video. */
const MAX_SHORT_SECONDS = 180;
const VIDEO_ID = /^[\w-]{6,20}$/;
const HANDLE_FROM_URL = /youtube\.com\/@([^/?#]+)/;

function channelHandle(channel: Record<string, unknown>): string | undefined {
  const handle = str(channel.handle);
  // Search results use "channel/<channelId>" when the channel has no @handle.
  if (handle && !handle.startsWith("channel/")) return cleanHandle(handle);
  const fromUrl = typeof channel.url === "string" ? HANDLE_FROM_URL.exec(channel.url)?.[1] : undefined;
  return fromUrl ? decodeURIComponent(fromUrl) : firstStr(channel.id);
}

/** Normalises one YouTube Short (or Short-length video) from any of the endpoints above. */
export function normaliseYouTube(input: unknown): Video | null {
  if (!isRecord(input)) return null;
  const type = str(input.type);
  if (type !== undefined && type !== "short" && type !== "video") return null;

  const id = firstStr(input.id, input.videoId);
  if (!id || !VIDEO_ID.test(id)) return null;

  const durationMs = num(input.durationMs);
  const durationSec =
    num(input.lengthSeconds) ??
    (durationMs !== undefined ? Math.round(durationMs / 1000) : undefined) ??
    clockToSeconds(input.lengthText) ??
    clockToSeconds(input.durationFormatted);
  if (type !== "short" && durationSec !== undefined && durationSec > MAX_SHORT_SECONDS) return null;

  const channel = isRecord(input.channel) ? input.channel : {};
  const caption = firstStr(input.title) ?? "";
  const description = firstStr(input.description);

  return {
    id,
    platform: "youtube",
    url: `https://www.youtube.com/shorts/${id}`,
    thumbnailUrl: firstStr(input.thumbnail) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    caption,
    hashtags: collectHashtags([], caption, description),
    author: {
      handle: channelHandle(channel) ?? "",
      displayName: firstStr(channel.title),
      avatarUrl: firstStr(channel.thumbnail),
    },
    stats: {
      views: firstNum(input.viewCountInt, input.viewCountText),
      likes: firstNum(input.likeCountInt, input.likeCountText),
      comments: firstNum(input.commentCountInt, input.commentCountText),
      shares: undefined,
    },
    postedAt: toIso(input.publishDate) ?? toIso(input.publishedTime),
    durationSec: durationSec || undefined,
    trendScore: 0,
  };
}

/**
 * Collects Short candidates from a search-style response. Explicit Shorts (`shorts[]` and
 * Shorts shelves) are preferred; only if there are none do we fall back to `videos[]`, keeping
 * items of at most 3 minutes (normaliseYouTube drops longer ones). This avoids mixing regular
 * short videos into results when the API does return a dedicated Shorts list.
 */
function shortsFrom(res: unknown): unknown[] {
  const shelfItems = asArray(get(res, "shelves"))
    .flatMap((shelf) => asArray(get(shelf, "items")))
    .filter((item) => get(item, "type") === "short");
  const explicit = [
    ...asArray(get(res, "shorts")),
    ...asArray(get(res, "videos")).filter((item) => get(item, "type") === "short"),
    ...shelfItems,
  ];
  return explicit.length > 0 ? explicit : asArray(get(res, "videos"));
}

export const youtubeAdapter: PlatformAdapter = {
  platform: "youtube",

  async trending(sc: ScFetch): Promise<Video[]> {
    const res = await sc("/v1/youtube/shorts/trending", {});
    return normaliseAll(asArray(get(res, "shorts")), normaliseYouTube);
  },

  async search(sc: ScFetch, term: string): Promise<Video[]> {
    const trimmed = term.trim();
    if (trimmed.startsWith("#")) {
      const hashtag = trimmed.replace(/^#+/, "").trim();
      if (!hashtag) return [];
      const res = await sc("/v1/youtube/search/hashtag", { hashtag, type: "shorts" });
      return normaliseAll(shortsFrom(res), normaliseYouTube);
    }
    if (!trimmed) return [];
    const res = await sc("/v1/youtube/search", { query: trimmed, type: "shorts" });
    return normaliseAll(shortsFrom(res), normaliseYouTube);
  },

  async profile(sc: ScFetch, handle: string): Promise<ProfileWithPosts> {
    const wanted = cleanHandle(handle);
    // 2 credits: channel details (subscribers) + the channel's Shorts, fetched in parallel.
    const [channelRes, shortsRes] = await Promise.all([
      sc("/v1/youtube/channel", { handle: wanted }),
      sc("/v1/youtube/channel/shorts", { handle: wanted }),
    ]);
    const followers = positive(firstNum(get(channelRes, "subscriberCount"), get(channelRes, "subscriberCountText")));
    const channelUrl = str(get(channelRes, "channel"));
    const resolvedHandle =
      (channelUrl ? HANDLE_FROM_URL.exec(channelUrl)?.[1] : undefined) ?? wanted;
    const sources = asArray(get(channelRes, "avatar", "image", "sources"));
    const avatarUrl = firstStr(get(sources[sources.length - 1], "url"));
    const displayName = firstStr(get(channelRes, "name"));

    const videos = normaliseAll(shortsFrom(shortsRes), normaliseYouTube);
    for (const video of videos) {
      if (!video.author.handle) video.author.handle = resolvedHandle;
      video.author.displayName ??= displayName;
      video.author.avatarUrl ??= avatarUrl;
      video.author.followers ??= followers;
    }
    return { handle: resolvedHandle, followers, videos };
  },

  async transcript(sc: ScFetch, videoUrl: string): Promise<string | null> {
    const res = await sc("/v1/youtube/video/transcript", { url: videoUrl });
    const plain = str(get(res, "transcript_only_text"));
    if (plain) return plain.replace(/\s+/g, " ");
    const joined = asArray(get(res, "transcript"))
      .map((s) => str(get(s, "text")))
      .filter((s): s is string => s !== undefined)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return joined || null;
  },
};
