import { describe, expect, it } from "vitest";
import keywordFixture from "./fixtures/tiktok-search-keyword.json";
import hashtagFixture from "./fixtures/tiktok-search-hashtag.json";
import profileFixture from "./fixtures/tiktok-profile.json";
import profileVideosFixture from "./fixtures/tiktok-profile-videos.json";
import transcriptFixture from "./fixtures/tiktok-transcript.json";
import trendingFixture from "./fixtures/tiktok-trending-feed.json";
import { normaliseTikTok, tiktokAdapter } from "./tiktok.ts";
import type { AllowedPath, ScFetch } from "./types.ts";

/** Fake Scrape Creators client: returns fixtures by path and records every call (no credits). */
function fakeSc(responses: Partial<Record<AllowedPath, unknown>>) {
  const calls: { path: AllowedPath; params: Record<string, string> }[] = [];
  const sc: ScFetch = async (path, params) => {
    calls.push({ path, params });
    if (!(path in responses)) throw new Error(`unexpected call to ${path}`);
    return structuredClone(responses[path]);
  };
  return Object.assign(sc, { calls });
}

describe("tiktokAdapter.trending", () => {
  it("calls the trending feed with the required region and skips photo posts", async () => {
    const sc = fakeSc({ "/v1/tiktok/get-trending-feed": trendingFixture });
    const videos = await tiktokAdapter.trending(sc);

    expect(sc.calls).toEqual([{ path: "/v1/tiktok/get-trending-feed", params: { region: "US" } }]);
    // The first documented item is a photo carousel (image_post_info, /photo/ URL).
    expect(videos.map((v) => v.id)).toEqual(["7540968798585670968"]);
    expect(videos[0]).toMatchObject({
      platform: "tiktok",
      url: "https://www.tiktok.com/@lyngame.52/video/7540968798585670968",
      caption: "Thrilling 3D motorcycle chases in the city. Evade cops at top speed!",
      author: { handle: "lyngame.52", displayName: "lyngame.52" },
      stats: { views: 589406, likes: 6035, comments: 27, shares: 192 },
      postedAt: "2025-08-21T09:31:54.000Z",
      trendScore: 0,
    });
    // No cover in this documented item: thumbnail is empty, not invented.
    expect(videos[0].thumbnailUrl).toBe("");
    expect(videos[0].author.followers).toBeUndefined();
  });
});

describe("tiktokAdapter.search", () => {
  it("uses /search/keyword for plain terms and normalises aweme_info items", async () => {
    const sc = fakeSc({ "/v1/tiktok/search/keyword": keywordFixture });
    const videos = await tiktokAdapter.search(sc, "  super bowl ");

    expect(sc.calls).toEqual([{ path: "/v1/tiktok/search/keyword", params: { query: "super bowl" } }]);
    expect(videos).toHaveLength(1);
    const [video] = videos;
    expect(video).toMatchObject({
      id: "7334621391758642478",
      platform: "tiktok",
      // Rebuilt from unique_id + aweme_id (the documented `url` points at another video).
      url: "https://www.tiktok.com/@kansascitychiefsfan5/video/7334621391758642478",
      author: { handle: "kansascitychiefsfan5", displayName: "Peter Griffin, fan", followers: 25 },
      stats: { views: 31677, likes: 355, comments: 5, shares: 22 },
      postedAt: "2024-02-12T07:58:02.000Z",
      durationSec: 84,
      soundName: "Yeah! (feat. Lil Jon & Ludacris)",
      trendScore: 0,
    });
    expect(video.thumbnailUrl).toMatch(/^https:\/\/p16-sign\.tiktokcdn-us\.com\//);
    expect(video.author.avatarUrl).toMatch(/^https:\/\/p16-amd-va\.tiktokcdn\.com\//);
    expect(video.hashtags).toEqual(["superbowlhalftime", "superbowl", "traviskelce", "kansascitychiefs"]);
  });

  it("uses /search/hashtag for #terms, stripping the #", async () => {
    const sc = fakeSc({ "/v1/tiktok/search/hashtag": hashtagFixture });
    const videos = await tiktokAdapter.search(sc, "#fyp");

    expect(sc.calls).toEqual([{ path: "/v1/tiktok/search/hashtag", params: { hashtag: "fyp" } }]);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      id: "6862153058223197445",
      url: "https://www.tiktok.com/@bellapoarch/video/6862153058223197445",
      hashtags: ["fyp"],
      stats: { views: 852942803, likes: 68933772, comments: 2901351, shares: 42457977 },
      postedAt: "2020-08-18T02:58:41.000Z",
      durationSec: 11,
      soundName: "M to the B",
    });
    // follower_count: 0 in search payloads means "unknown", not zero.
    expect(videos[0].author.followers).toBeUndefined();
  });

  it("does not spend a credit on an empty term", async () => {
    const sc = fakeSc({});
    expect(await tiktokAdapter.search(sc, "#")).toEqual([]);
    expect(await tiktokAdapter.search(sc, "   ")).toEqual([]);
    expect(sc.calls).toEqual([]);
  });
});

describe("tiktokAdapter.profile", () => {
  it("uses only /v3/tiktok/profile/videos when it already carries follower_count", async () => {
    const sc = fakeSc({ "/v3/tiktok/profile/videos": profileVideosFixture });
    const profile = await tiktokAdapter.profile(sc, "@stoolpresidente");

    expect(sc.calls).toEqual([{ path: "/v3/tiktok/profile/videos", params: { handle: "stoolpresidente" } }]);
    expect(profile.handle).toBe("stoolpresidente");
    expect(profile.followers).toBe(4248754);
    expect(profile.videos).toHaveLength(1);
    expect(profile.videos[0]).toMatchObject({
      id: "7470969622276164906",
      url: "https://www.tiktok.com/@stoolpresidente/video/7470969622276164906",
      stats: { views: 141567, likes: 18651, comments: 152, shares: 237 },
      durationSec: 89,
    });
  });

  it("falls back to /v1/tiktok/profile for followers (2 calls max)", async () => {
    const noFollowers = structuredClone(profileVideosFixture) as { aweme_list: { author: Record<string, unknown> }[] };
    delete noFollowers.aweme_list[0].author.follower_count;
    const sc = fakeSc({ "/v3/tiktok/profile/videos": noFollowers, "/v1/tiktok/profile": profileFixture });
    const profile = await tiktokAdapter.profile(sc, "stoolpresidente");

    expect(sc.calls.map((c) => c.path)).toEqual(["/v3/tiktok/profile/videos", "/v1/tiktok/profile"]);
    expect(profile.followers).toBe(4100000);
    expect(profile.videos[0].author.followers).toBe(4100000);
  });
});

describe("tiktokAdapter.transcript", () => {
  it("strips WebVTT headers and timings into plain text", async () => {
    const sc = fakeSc({ "/v1/tiktok/video/transcript": transcriptFixture });
    const url = "https://www.tiktok.com/@stoolpresidente/video/7499229683859426602";
    const text = await tiktokAdapter.transcript(sc, url);

    expect(sc.calls).toEqual([{ path: "/v1/tiktok/video/transcript", params: { url } }]);
    expect(text).toBe(
      "Alright, pizza review time. Sal's Pizza Factory. Oh, it's Fucking Corn. We're in Charlotte. " +
        "Alright man, any chance I can get a real quick picture? Shaq or Dwight Howard? I gotta pick one.",
    );
  });

  it("returns null when there is no transcript", async () => {
    const sc = fakeSc({ "/v1/tiktok/video/transcript": { success: true, transcript: null, transcript_with_timestamp: null } });
    expect(await tiktokAdapter.transcript(sc, "https://www.tiktok.com/@a/video/1")).toBeNull();
  });

  it("falls back to timestamp segments when the plain transcript is missing", async () => {
    const sc = fakeSc({
      "/v1/tiktok/video/transcript": { transcript_with_timestamp: [{ start: 0, end: 1, text: "Hello" }, { text: " world " }] },
    });
    expect(await tiktokAdapter.transcript(sc, "https://www.tiktok.com/@a/video/1")).toBe("Hello world");
  });
});

describe("normaliseTikTok edge cases", () => {
  it("keeps missing stats undefined instead of 0 and does not throw", () => {
    const video = normaliseTikTok({ aweme_id: "123", author: { unique_id: "someone" } });
    expect(video).toEqual({
      id: "123",
      platform: "tiktok",
      url: "https://www.tiktok.com/@someone/video/123",
      thumbnailUrl: "",
      caption: "",
      hashtags: [],
      author: { handle: "someone" },
      stats: {},
      trendScore: 0,
    });
  });

  it("skips items without an id or without any way to build a URL", () => {
    expect(normaliseTikTok({ desc: "no id", author: { unique_id: "x" } })).toBeNull();
    expect(normaliseTikTok({ aweme_id: "123" })).toBeNull();
    expect(normaliseTikTok(null)).toBeNull();
    expect(normaliseTikTok("garbage")).toBeNull();
  });

  it("recovers the handle from url/share_url only when it is for the same post", () => {
    expect(normaliseTikTok({ aweme_id: "42", url: "https://www.tiktok.com/@abc/video/42" })?.url).toBe(
      "https://www.tiktok.com/@abc/video/42",
    );
    expect(normaliseTikTok({ aweme_id: "42", url: "https://www.tiktok.com/@abc/video/999" })).toBeNull();
  });

  it("handles Top-search style items (id + ISO create_time) and odd value types", () => {
    const video = normaliseTikTok({
      id: "7629303091011079455",
      content_type: "video",
      create_time: "2026-04-16T10:32:45.000Z",
      desc: 42,
      statistics: { play_count: "1,383", digg_count: -1, comment_count: null, share_count: "n/a" },
      author: { unique_id: "laughtime1986", follower_count: "351972" },
      video: { duration: 0, cover: { url_list: [] } },
    });
    expect(video).toMatchObject({
      id: "7629303091011079455",
      postedAt: "2026-04-16T10:32:45.000Z",
      caption: "42",
      author: { handle: "laughtime1986", followers: 351972 },
      stats: { views: 1383 },
      thumbnailUrl: "",
    });
    expect(video?.stats.likes).toBeUndefined();
    expect(video?.stats.comments).toBeUndefined();
    expect(video?.stats.shares).toBeUndefined();
    expect(video?.durationSec).toBeUndefined();
  });

  it("skips photo carousels from Top search", () => {
    expect(
      normaliseTikTok({ id: "1", content_type: "multi_photo", author: { unique_id: "a" } }),
    ).toBeNull();
  });
});
