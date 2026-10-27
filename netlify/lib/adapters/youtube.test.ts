import { describe, expect, it } from "vitest";
import channelFixture from "./fixtures/youtube-channel.json";
import channelShortsFixture from "./fixtures/youtube-channel-shorts.json";
import hashtagFixture from "./fixtures/youtube-search-hashtag.json";
import searchFixture from "./fixtures/youtube-search.json";
import transcriptFixture from "./fixtures/youtube-transcript.json";
import trendingFixture from "./fixtures/youtube-shorts-trending.json";
import type { AllowedPath, ScFetch } from "./types.ts";
import { normaliseYouTube, youtubeAdapter } from "./youtube.ts";

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

describe("youtubeAdapter.trending", () => {
  it("normalises /v1/youtube/shorts/trending", async () => {
    const sc = fakeSc({ "/v1/youtube/shorts/trending": trendingFixture });
    const videos = await youtubeAdapter.trending(sc);

    expect(sc.calls).toEqual([{ path: "/v1/youtube/shorts/trending", params: {} }]);
    expect(videos.map((v) => v.id)).toEqual(["ou0nl5ET0HA", "RHjn1eyPLgI", "urisfWQu5bc"]);
    expect(videos[0]).toEqual({
      id: "ou0nl5ET0HA",
      platform: "youtube",
      url: "https://www.youtube.com/shorts/ou0nl5ET0HA",
      thumbnailUrl: "https://img.youtube.com/vi/ou0nl5ET0HA/maxresdefault.jpg",
      caption: "That hooper who says their just shoes",
      hashtags: [],
      author: { handle: "dameuniverse", displayName: "Dame Universe" },
      stats: { views: 13798774, likes: 151957, comments: 168 },
      postedAt: "2025-08-07T20:00:22.000Z",
      durationSec: 19,
      trendScore: 0,
    });
    // likeCountInt is null in the docs: stays undefined. commentCountInt 1500 ("1.5K").
    expect(videos[1].stats).toEqual({ views: 9550557, comments: 1500 });
    expect(videos[1].stats.likes).toBeUndefined();
    // Hashtags come from the title first, then the (long) description.
    expect(videos[1].hashtags.slice(0, 3)).toEqual(["discipline", "success", "mindset"]);
    expect(videos[1].hashtags).toEqual(expect.arrayContaining(["cosmology", "hubble"]));
    expect(new Set(videos[1].hashtags).size).toBe(videos[1].hashtags.length);
  });
});

describe("youtubeAdapter.search", () => {
  it("uses /v1/youtube/search with type=shorts and keeps only Shorts", async () => {
    const sc = fakeSc({ "/v1/youtube/search": searchFixture });
    const videos = await youtubeAdapter.search(sc, "running");

    expect(sc.calls).toEqual([{ path: "/v1/youtube/search", params: { query: "running", type: "shorts" } }]);
    // shorts[] + the Shorts shelf; regular videos[] are ignored when Shorts are present.
    expect(videos.map((v) => v.id)).toEqual(["uMNvF-lSCHg", "LLBR5nO05tE"]);
    expect(videos[0]).toMatchObject({
      url: "https://www.youtube.com/shorts/uMNvF-lSCHg",
      caption: "LONG RUN ROUTINE #run #runvlog #runner #shorts #morning",
      hashtags: ["run", "runvlog", "runner", "shorts", "morning"],
      author: { handle: "abbyandryan", displayName: "Abby and Ryan" },
      stats: { views: 462705 },
      postedAt: "2024-07-28T17:08:46.498Z",
      durationSec: 44,
    });
    expect(videos[0].author.avatarUrl).toMatch(/^https:\/\/yt3\.ggpht\.com\//);
    expect(videos[0].thumbnailUrl).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/uMNvF-lSCHg\//);
    // Shelf items are sparse: "750K" view text, no channel, no date.
    expect(videos[1]).toMatchObject({ stats: { views: 750000 }, author: { handle: "" } });
    expect(videos[1].postedAt).toBeUndefined();
    expect(videos[1].stats.likes).toBeUndefined();
  });

  it("uses /v1/youtube/search/hashtag with type=shorts for #terms", async () => {
    const sc = fakeSc({ "/v1/youtube/search/hashtag": hashtagFixture });
    const videos = await youtubeAdapter.search(sc, "#funny");

    expect(sc.calls).toEqual([
      { path: "/v1/youtube/search/hashtag", params: { hashtag: "funny", type: "shorts" } },
    ]);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      id: "jXMISgQq9MM",
      url: "https://www.youtube.com/shorts/jXMISgQq9MM",
      hashtags: ["shorts", "funny", "fails"],
      // No @handle in this payload: falls back to the channel id.
      author: { handle: "UCvUzWu1Whyw1FWuLl9GOo_g", displayName: "ZZang Funny" },
      stats: { views: 22668056 },
      durationSec: 60,
    });
  });

  it("drops regular long videos when no explicit Shorts list is returned", async () => {
    const sc = fakeSc({
      "/v1/youtube/search": { videos: searchFixture.videos, shorts: [], shelves: [] },
    });
    // Both documented videos are > 3 minutes (254 s and 3198 s).
    expect(await youtubeAdapter.search(sc, "running")).toEqual([]);
  });

  it("does not spend a credit on an empty term", async () => {
    const sc = fakeSc({});
    expect(await youtubeAdapter.search(sc, " # ")).toEqual([]);
    expect(sc.calls).toEqual([]);
  });
});

describe("youtubeAdapter.profile", () => {
  it("fetches channel details + channel Shorts (2 calls) and fills the author", async () => {
    const sc = fakeSc({
      "/v1/youtube/channel": channelFixture,
      "/v1/youtube/channel/shorts": channelShortsFixture,
    });
    const profile = await youtubeAdapter.profile(sc, "@ThePatMcAfeeShow");

    expect(sc.calls).toEqual([
      { path: "/v1/youtube/channel", params: { handle: "ThePatMcAfeeShow" } },
      { path: "/v1/youtube/channel/shorts", params: { handle: "ThePatMcAfeeShow" } },
    ]);
    expect(profile.handle).toBe("ThePatMcAfeeShow");
    expect(profile.followers).toBe(2750000);
    expect(profile.videos.map((v) => v.id)).toEqual(["VREVC0wXPfs", "LUTxdXW4TUI", "1YGz9bkG7z0"]);
    expect(profile.videos[0]).toMatchObject({
      url: "https://www.youtube.com/shorts/VREVC0wXPfs",
      author: { handle: "ThePatMcAfeeShow", displayName: "The Pat McAfee Show", followers: 2750000 },
      stats: { views: 17066, likes: 495, comments: 2 },
      postedAt: "2026-04-22T17:44:35.000Z",
      durationSec: 37,
    });
    expect(profile.videos[0].author.avatarUrl).toMatch(/s160-c-k/);
  });
});

describe("youtubeAdapter.transcript", () => {
  it("returns transcript_only_text", async () => {
    const sc = fakeSc({ "/v1/youtube/video/transcript": transcriptFixture });
    const url = "https://www.youtube.com/shorts/bjVIDXPP7Uk";
    const text = await youtubeAdapter.transcript(sc, url);
    expect(sc.calls).toEqual([{ path: "/v1/youtube/video/transcript", params: { url } }]);
    expect(text).toMatch(/^welcome back to the hell farm and the backyard trails/);
  });

  it("falls back to the segments, and returns null when there is nothing", async () => {
    const segmentsOnly = { transcript: transcriptFixture.transcript, transcript_only_text: null };
    let sc = fakeSc({ "/v1/youtube/video/transcript": segmentsOnly });
    expect(await youtubeAdapter.transcript(sc, "https://youtu.be/x")).toBe(
      "welcome back to the hell farm and the backyard trails we built these jumps two",
    );
    sc = fakeSc({ "/v1/youtube/video/transcript": { success: true, transcript: null } });
    expect(await youtubeAdapter.transcript(sc, "https://youtu.be/x")).toBeNull();
  });
});

describe("normaliseYouTube edge cases", () => {
  it("keeps missing fields undefined and builds a thumbnail from the id", () => {
    expect(normaliseYouTube({ id: "abcdefghijk" })).toEqual({
      id: "abcdefghijk",
      platform: "youtube",
      url: "https://www.youtube.com/shorts/abcdefghijk",
      thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      caption: "",
      hashtags: [],
      author: { handle: "" },
      stats: {},
      trendScore: 0,
    });
  });

  it("parses text-only counts and clock durations", () => {
    const video = normaliseYouTube({
      type: "short",
      id: "abcdefghijk",
      viewCountText: "1.2M views",
      likeCountText: "3,456",
      commentCountText: "No comments",
      lengthText: "0:59",
      channel: { handle: "channel/UC123", url: "https://www.youtube.com/@someone" },
    });
    expect(video?.stats).toEqual({ views: 1200000, likes: 3456 });
    expect(video?.durationSec).toBe(59);
    expect(video?.author.handle).toBe("someone");
  });

  it("skips non-video items and bad ids", () => {
    expect(normaliseYouTube({ type: "channel", id: "UCabc" })).toBeNull();
    expect(normaliseYouTube({ type: "shelf", title: "Shorts" })).toBeNull();
    expect(normaliseYouTube({ id: "bad id with spaces" })).toBeNull();
    expect(normaliseYouTube([])).toBeNull();
  });
});
