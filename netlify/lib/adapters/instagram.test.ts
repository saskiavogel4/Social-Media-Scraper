import { describe, expect, it } from "vitest";
import hashtagFixture from "./fixtures/instagram-search-hashtag.json";
import profileFixture from "./fixtures/instagram-profile.json";
import searchFixture from "./fixtures/instagram-reels-search.json";
import transcriptFixture from "./fixtures/instagram-transcript.json";
import trendingFixture from "./fixtures/instagram-reels-trending.json";
import userReelsFixture from "./fixtures/instagram-user-reels.json";
import { instagramAdapter, normaliseInstagram } from "./instagram.ts";
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

describe("instagramAdapter.trending", () => {
  it("normalises /v1/instagram/reels/trending", async () => {
    const sc = fakeSc({ "/v1/instagram/reels/trending": trendingFixture });
    const videos = await instagramAdapter.trending(sc);

    expect(sc.calls).toEqual([{ path: "/v1/instagram/reels/trending", params: {} }]);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      id: "4000819054877393649",
      platform: "instagram",
      url: "https://www.instagram.com/reel/DeFw7uwlMLx/",
      thumbnailUrl: "https://scontent.cdninstagram.com/example.jpg",
      hashtags: ["ufc335"],
      author: { handle: "ufc", displayName: "UFC", avatarUrl: "https://scontent.cdninstagram.com/example.jpg" },
      stats: { views: 5112349, likes: 423127, comments: 1623 },
      postedAt: "2026-10-04T23:00:03.000Z",
      soundName: "Original audio",
      trendScore: 0,
    });
    expect(videos[0].caption).toMatch(/^Impatiently waiting for #UFC335/);
    expect(videos[0].stats.shares).toBeUndefined();
    expect(videos[0].author.followers).toBeUndefined();
    expect(videos[0].durationSec).toBeUndefined();
  });
});

describe("instagramAdapter.search", () => {
  it("uses /v2/instagram/reels/search for keywords", async () => {
    const sc = fakeSc({ "/v2/instagram/reels/search": searchFixture });
    const videos = await instagramAdapter.search(sc, "dogs");

    expect(sc.calls).toEqual([{ path: "/v2/instagram/reels/search", params: { query: "dogs" } }]);
    expect(videos.map((v) => v.id)).toEqual(["3723045213787686915", "3799150343414200124", "3715654391585421188"]);
    expect(videos[0]).toMatchObject({
      url: "https://www.instagram.com/reel/DOq6eV6iIgD/",
      author: {
        handle: "fetchmycamera_",
        displayName: "Mark | Dog Photographer & Storyteller",
        followers: 188406,
      },
      stats: { likes: 3487, comments: 90 },
      postedAt: "2025-09-16T16:56:45.000Z",
      durationSec: 75.7,
      soundName: "Smiling Heart",
    });
    expect(videos[0].thumbnailUrl).toMatch(/^https:\/\/scontent-sjc3-1\.cdninstagram\.com\//);
    // The documented search payload has no view count: stays undefined, never 0.
    expect(videos.every((v) => v.stats.views === undefined)).toBe(true);
    expect(videos[2].hashtags).toContain("ad");
  });

  it("uses /v1/instagram/search/hashtag for #terms, reels only", async () => {
    const sc = fakeSc({ "/v1/instagram/search/hashtag": hashtagFixture });
    const videos = await instagramAdapter.search(sc, "#funnydogs");

    expect(sc.calls).toEqual([
      { path: "/v1/instagram/search/hashtag", params: { hashtag: "funnydogs", media_type: "reels" } },
    ]);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      id: "3714950709444987377",
      url: "https://www.instagram.com/reel/DOOJ_zSjcnx/",
      author: { handle: "_layla_the_boxer", followers: 1369176 },
      stats: { likes: 35854, comments: 1263 },
    });
    expect(videos[0].hashtags).toEqual(expect.arrayContaining(["funnydogs", "funny", "whiteboxer"]));
    expect(videos[1].hashtags).toEqual(["funny", "funnyvideos", "dog", "funnydogs", "doglife"]);
    expect(videos[1].stats.comments).toBe(0); // a real reported 0 is kept
  });

  it("does not spend a credit on an empty term", async () => {
    const sc = fakeSc({});
    expect(await instagramAdapter.search(sc, "#")).toEqual([]);
    expect(sc.calls).toEqual([]);
  });
});

describe("instagramAdapter.profile", () => {
  it("uses one /v1/instagram/profile call when recent posts include videos", async () => {
    const sc = fakeSc({ "/v1/instagram/profile": profileFixture });
    const profile = await instagramAdapter.profile(sc, "@adrianhorning");

    expect(sc.calls).toEqual([{ path: "/v1/instagram/profile", params: { handle: "adrianhorning" } }]);
    expect(profile).toMatchObject({ handle: "adrianhorning", followers: 25116 });
    expect(profile.videos).toHaveLength(1);
    expect(profile.videos[0]).toMatchObject({
      id: "3540614075954356349",
      url: "https://www.instagram.com/reel/DEiyb48AeB9/",
      caption: "",
      author: { handle: "adrianhorning", displayName: "Adrian Horning", followers: 25116 },
      stats: { views: 1318, likes: 126, comments: 12 },
      postedAt: "2025-01-07T23:56:41.000Z",
      soundName: "Original audio",
    });
  });

  it("reads captions from edge_media_to_caption", async () => {
    const withCaption = structuredClone(profileFixture);
    withCaption.data.user.edge_owner_to_timeline_media.edges[0].node.edge_media_to_caption = {
      edges: [{ node: { text: "Scraping tips #webscraping #api" } }],
    } as never;
    const sc = fakeSc({ "/v1/instagram/profile": withCaption });
    const profile = await instagramAdapter.profile(sc, "adrianhorning");
    expect(profile.videos[0].caption).toBe("Scraping tips #webscraping #api");
    expect(profile.videos[0].hashtags).toEqual(["webscraping", "api"]);
  });

  it("falls back to /v1/instagram/user/reels when the profile has no video posts", async () => {
    const noVideos = structuredClone(profileFixture);
    noVideos.data.user.edge_owner_to_timeline_media.edges[0].node.is_video = false;
    const sc = fakeSc({ "/v1/instagram/profile": noVideos, "/v1/instagram/user/reels": userReelsFixture });
    const profile = await instagramAdapter.profile(sc, "adrianhorning");

    expect(sc.calls).toEqual([
      { path: "/v1/instagram/profile", params: { handle: "adrianhorning" } },
      { path: "/v1/instagram/user/reels", params: { handle: "adrianhorning" } },
    ]);
    expect(profile.videos).toHaveLength(1);
    expect(profile.videos[0]).toMatchObject({
      id: "3540614075954356349", // "<pk>_<userId>" id is reduced to the pk
      url: "https://www.instagram.com/reel/DEiyb48AeB9/",
      caption: "", // documented: captions are excluded from this endpoint
      author: { handle: "adrianhorning", displayName: "Adrian Horning", followers: 25116 },
      stats: { views: 3865, likes: 126, comments: 12 },
      postedAt: "2025-01-07T23:56:41.000Z",
      durationSec: 76.783,
    });
  });

  it("does not make the second call for private profiles", async () => {
    const privateProfile = structuredClone(profileFixture);
    privateProfile.data.user.is_private = true;
    privateProfile.data.user.edge_owner_to_timeline_media.edges = [];
    const sc = fakeSc({ "/v1/instagram/profile": privateProfile });
    const profile = await instagramAdapter.profile(sc, "adrianhorning");
    expect(sc.calls).toHaveLength(1);
    expect(profile).toEqual({ handle: "adrianhorning", followers: 25116, videos: [] });
  });
});

describe("instagramAdapter.transcript", () => {
  it("returns the transcript text", async () => {
    const sc = fakeSc({ "/v2/instagram/media/transcript": transcriptFixture });
    const url = "https://www.instagram.com/reel/DHsD6HGqJhp/";
    const text = await instagramAdapter.transcript(sc, url);
    expect(sc.calls).toEqual([{ path: "/v2/instagram/media/transcript", params: { url } }]);
    expect(text).toMatch(/^Let's fry up the perfect bunzel\. Beautiful\. Everybody, shh\./);
  });

  it("returns null when there is no transcript", async () => {
    for (const body of [{ transcripts: [] }, { transcripts: [{ text: null }] }, {}, null]) {
      const sc = fakeSc({ "/v2/instagram/media/transcript": body });
      expect(await instagramAdapter.transcript(sc, "https://www.instagram.com/reel/x/")).toBeNull();
    }
  });
});

describe("normaliseInstagram edge cases", () => {
  it("keeps missing fields undefined and does not throw", () => {
    expect(normaliseInstagram({ shortcode: "ABC" })).toEqual({
      id: "ABC",
      platform: "instagram",
      url: "https://www.instagram.com/reel/ABC/",
      thumbnailUrl: "",
      caption: "",
      hashtags: [],
      author: { handle: "" },
      stats: {},
      trendScore: 0,
    });
  });

  it("skips photos, carousels and items without a shortcode", () => {
    expect(normaliseInstagram({ id: "1", shortcode: "A", is_video: false })).toBeNull();
    expect(normaliseInstagram({ id: "1", shortcode: "A", media_type: 1 })).toBeNull();
    expect(normaliseInstagram({ id: "1", shortcode: "A", media_type: 8 })).toBeNull();
    expect(normaliseInstagram({ id: "1" })).toBeNull();
    expect(normaliseInstagram(undefined)).toBeNull();
  });

  it("derives the shortcode from the url and accepts caption objects", () => {
    const video = normaliseInstagram({
      id: "9",
      url: "https://www.instagram.com/p/XYZ123/",
      caption: { text: "Hello #World" },
      taken_at: "not a date",
      like_count: "1.2K",
    });
    expect(video).toMatchObject({
      id: "9",
      url: "https://www.instagram.com/reel/XYZ123/",
      caption: "Hello #World",
      hashtags: ["world"],
      stats: { likes: 1200 },
    });
    expect(video?.postedAt).toBeUndefined();
  });

  it("hides likes/views when the creator disabled them", () => {
    const video = normaliseInstagram({
      shortcode: "A",
      like_and_view_counts_disabled: true,
      video_view_count: 0,
      edge_liked_by: { count: -1 },
      edge_media_to_comment: { count: 3 },
    });
    expect(video?.stats).toEqual({ comments: 3 });
  });
});
