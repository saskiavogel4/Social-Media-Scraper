// Instagram adapter: Scrape Creators -> shared Video model.
//
// Docs verified 2026-10-27 (docs.scrapecreators.com, example responses -> fixtures/instagram-*.json):
// - GET /v1/instagram/reels/trending   no query params. Popular reels from the last 7 days;
//     too few results -> uncharged 503.                                                         1 credit.
//     -> { reels: [{ id, pk, shortcode, url, caption: string, taken_at: ISO, media_type,
//          play_count, ig_play_count, like_count, comment_count, image_url,
//          image_versions2.candidates[].url, clips_metadata.original_sound_info.original_audio_title,
//          user: { username, full_name, profile_pic_url } }] }
// - GET /v2/instagram/reels/search     params: query (required), date_posted (last-week|last-month|
//     last-year), page (1..11). Google-indexed, best effort.                                   1 credit.
//     -> { reels: [{ id, shortcode, url, caption, thumbnail_src, display_url, is_video,
//          video_duration, taken_at: ISO, like_count, comment_count,
//          clips_music_attribution_info.{song_name, artist_name},
//          owner: { username, full_name, profile_pic_url, follower_count } }] }
//     NOTE: the documented search payload has NO view/play count, so stats.views stays undefined.
// - GET /v1/instagram/search/hashtag   params: hashtag (required, with or without "#"),
//     date_posted (last-hour|last-day|last-week|last-month|last-year), media_type (all|reels),
//     cursor (page 2..11).                                                                      1 credit.
//     -> { posts: [same item shape as reels search], cursor }   We send media_type=reels.
// - GET /v1/instagram/profile          params: handle (required), trim, cache_max_age.         1 credit.
//     -> { data: { user: { username, full_name, profile_pic_url, is_private,
//          edge_followed_by.count, edge_owner_to_timeline_media.edges[].node: { id, shortcode,
//          is_video, video_view_count, taken_at_timestamp, edge_liked_by.count,
//          edge_media_preview_like.count, edge_media_to_comment.count,
//          edge_media_to_caption.edges[].node.text, thumbnail_src, display_url, owner } } } }
// - GET /v1/instagram/user/reels       params: user_id | handle, require_play_counts, trim,
//     max_id. Docs: "Pinned reels and captions are excluded."                                  1 credit.
//     -> { items: [{ media: { pk, id: "<pk>_<userId>", code, caption: null, taken_at: unix,
//          play_count, ig_play_count, like_count, comment_count, video_duration,
//          image_versions2.candidates[].url, user|owner: { username, full_name, profile_pic_url } } }],
//          paging_info: { max_id, more_available } }
// - GET /v2/instagram/media/transcript params: url (required), allow_long_transcription,
//     cache_max_age. AI transcript up to 2 min: 1 credit; none: 0 credits.
//     -> { transcripts: [{ id, shortcode, text, transcript_with_timestamp }] }
//
// Instagram exposes no share count, so stats.shares is always undefined.

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

const VIDEO_MEDIA_TYPE = 2; // Instagram media_type: 1 = image, 2 = video, 8 = carousel
const SHORTCODE_FROM_URL = /instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([\w-]+)/;

function captionOf(raw: Record<string, unknown>): string {
  if (typeof raw.caption === "string") return raw.caption.trim();
  return (
    firstStr(get(raw, "caption", "text"), get(raw, "edge_media_to_caption", "edges", 0, "node", "text")) ??
    ""
  );
}

/** Normalises one Instagram reel/post from any of the endpoints above (also `{ media }` / `{ node }`). */
export function normaliseInstagram(input: unknown): Video | null {
  const wrapped = get(input, "media") ?? get(input, "node");
  const raw = isRecord(wrapped) ? wrapped : input;
  if (!isRecord(raw)) return null;

  // Only videos (reels). Photos and carousels are skipped.
  if (raw.is_video === false) return null;
  if (typeof raw.media_type === "number" && raw.media_type !== VIDEO_MEDIA_TYPE) return null;

  const urlMatch = typeof raw.url === "string" ? SHORTCODE_FROM_URL.exec(raw.url) : null;
  const shortcode = firstStr(raw.shortcode, raw.code) ?? urlMatch?.[1];
  const id = firstStr(raw.pk, str(raw.id)?.split("_")[0]) ?? shortcode;
  if (!id || !shortcode) return null; // a reel link needs the shortcode

  const owner = isRecord(raw.owner) ? raw.owner : isRecord(raw.user) ? raw.user : {};
  const caption = captionOf(raw);
  const countsHidden = raw.like_and_view_counts_disabled === true;

  return {
    id,
    platform: "instagram",
    url: `https://www.instagram.com/reel/${shortcode}/`,
    thumbnailUrl:
      firstStr(
        raw.thumbnail_src,
        raw.display_url,
        get(raw, "image_versions2", "candidates", 0, "url"),
        raw.image_url,
      ) ?? "",
    caption,
    hashtags: collectHashtags([], caption),
    author: {
      handle: firstStr(owner.username) ?? "",
      displayName: firstStr(owner.full_name),
      followers: positive(firstNum(owner.follower_count, get(owner, "edge_followed_by", "count"))),
      avatarUrl: firstStr(owner.profile_pic_url),
    },
    stats: {
      views: countsHidden ? undefined : firstNum(raw.play_count, raw.ig_play_count, raw.video_view_count),
      likes: countsHidden
        ? undefined
        : firstNum(raw.like_count, get(raw, "edge_liked_by", "count"), get(raw, "edge_media_preview_like", "count")),
      comments: firstNum(raw.comment_count, get(raw, "edge_media_to_comment", "count")),
      shares: undefined,
    },
    postedAt: toIso(raw.taken_at) ?? toIso(raw.taken_at_timestamp),
    durationSec: num(raw.video_duration) || undefined,
    soundName: firstStr(
      get(raw, "clips_music_attribution_info", "song_name"),
      get(raw, "clips_metadata", "original_sound_info", "original_audio_title"),
    ),
    trendScore: 0,
  };
}

/** Fills author details the per-post objects lack (profile posts only carry owner.username). */
function withProfileAuthor(videos: Video[], user: unknown, followers: number | undefined): Video[] {
  const handle = firstStr(get(user, "username"));
  for (const video of videos) {
    if (!video.author.handle && handle) video.author.handle = handle;
    if (handle && video.author.handle.toLowerCase() !== handle.toLowerCase()) continue;
    video.author.displayName ??= firstStr(get(user, "full_name"));
    video.author.avatarUrl ??= firstStr(get(user, "profile_pic_url"));
    video.author.followers ??= followers;
  }
  return videos;
}

export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",

  async trending(sc: ScFetch): Promise<Video[]> {
    const res = await sc("/v1/instagram/reels/trending", {});
    return normaliseAll(asArray(get(res, "reels")), normaliseInstagram);
  },

  async search(sc: ScFetch, term: string): Promise<Video[]> {
    const trimmed = term.trim();
    if (trimmed.startsWith("#")) {
      const hashtag = trimmed.replace(/^#+/, "").trim();
      if (!hashtag) return [];
      const res = await sc("/v1/instagram/search/hashtag", { hashtag, media_type: "reels" });
      return normaliseAll(asArray(get(res, "posts")), normaliseInstagram);
    }
    if (!trimmed) return [];
    const res = await sc("/v2/instagram/reels/search", { query: trimmed });
    return normaliseAll(asArray(get(res, "reels")), normaliseInstagram);
  },

  async profile(sc: ScFetch, handle: string): Promise<ProfileWithPosts> {
    const wanted = cleanHandle(handle);
    // 1 credit: profile details + recent posts (with captions, which /user/reels omits).
    const res = await sc("/v1/instagram/profile", { handle: wanted });
    const user = get(res, "data", "user");
    const followers = positive(firstNum(get(user, "edge_followed_by", "count")));
    const resolvedHandle = firstStr(get(user, "username")) ?? wanted;

    let videos = normaliseAll(
      asArray(get(user, "edge_owner_to_timeline_media", "edges")),
      normaliseInstagram,
    );

    // +1 credit only if the recent posts contained no videos and the account is public.
    if (videos.length === 0 && get(user, "is_private") !== true) {
      const reelsRes = await sc("/v1/instagram/user/reels", { handle: resolvedHandle });
      videos = normaliseAll(asArray(get(reelsRes, "items")), normaliseInstagram);
    }

    return { handle: resolvedHandle, followers, videos: withProfileAuthor(videos, user, followers) };
  },

  async transcript(sc: ScFetch, videoUrl: string): Promise<string | null> {
    const res = await sc("/v2/instagram/media/transcript", { url: videoUrl });
    const parts = asArray(get(res, "transcripts"))
      .map((t) => str(get(t, "text")))
      .filter((t): t is string => t !== undefined)
      .map(vttToText)
      .filter((t) => t !== "");
    return parts.length > 0 ? parts.join("\n\n") : null;
  },
};
