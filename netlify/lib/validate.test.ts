import { describe, expect, it } from "vitest";
import {
  ValidationError,
  parseProfileNicheQuery,
  parseSearchQuery,
  parseTranscriptQuery,
  parseTrendingQuery,
} from "./validate.ts";

const qs = (s: string) => new URLSearchParams(s);
const bad = (fn: () => unknown) => expect(fn).toThrow(ValidationError);

describe("search", () => {
  it("parses a valid query with defaults", () => {
    expect(parseSearchQuery(qs("platform=all&q=%20home%20%20workout%20&q=%23fitness"))).toEqual({
      platform: "all",
      terms: ["home workout", "#fitness"],
      window: "7d",
      minViews: 0,
    });
  });

  it("accepts unicode letters and allowed punctuation", () => {
    expect(parseSearchQuery(qs("platform=tiktok&q=café&q=日本料理&q=rock'n_roll-1.0")).terms).toEqual([
      "café",
      "日本料理",
      "rock'n_roll-1.0",
    ]);
  });

  it("dedupes terms case-insensitively", () => {
    expect(parseSearchQuery(qs("platform=tiktok&q=Cats&q=cats")).terms).toEqual(["Cats"]);
  });

  it("rejects bad input", () => {
    bad(() => parseSearchQuery(qs("platform=all")));
    bad(() => parseSearchQuery(qs("platform=facebook&q=x")));
    bad(() => parseSearchQuery(qs("q=x")));
    bad(() => parseSearchQuery(qs("platform=all&q=")));
    bad(() => parseSearchQuery(qs("platform=all&q=%20%20")));
    bad(() => parseSearchQuery(qs("platform=all&q=%23")));
    bad(() => parseSearchQuery(qs(`platform=all&q=${"a".repeat(61)}`)));
    bad(() => parseSearchQuery(qs("platform=all&q=a&q=b&q=c&q=d&q=e&q=f")));
    bad(() => parseSearchQuery(qs("platform=all&q=<script>")));
    bad(() => parseSearchQuery(qs("platform=all&q=a%26b")));
    bad(() => parseSearchQuery(qs("platform=all&q=x&window=1y")));
    bad(() => parseSearchQuery(qs("platform=all&q=x&minViews=-1")));
    bad(() => parseSearchQuery(qs("platform=all&q=x&minViews=1.5")));
    bad(() => parseSearchQuery(qs("platform=all&q=x&minViews=10000000001")));
    bad(() => parseSearchQuery(qs("platform=all&q=x&minViews=1e5")));
    bad(() => parseSearchQuery(qs("platform=all&q=x&apiKey=1")));
    bad(() => parseSearchQuery(qs("platform=all&platform=tiktok&q=x")));
  });

  it("accepts boundary values", () => {
    const q = parseSearchQuery(qs(`platform=youtube&q=${"a".repeat(60)}&window=any&minViews=10000000000`));
    expect(q.minViews).toBe(1e10);
    expect(q.window).toBe("any");
  });
});

describe("trending", () => {
  it("parses and rejects q", () => {
    expect(parseTrendingQuery(qs("platform=instagram&window=24h&minViews=5"))).toEqual({
      platform: "instagram",
      window: "24h",
      minViews: 5,
    });
    bad(() => parseTrendingQuery(qs("platform=instagram&q=x")));
  });
});

describe("profile-niche", () => {
  it("strips @ and validates the handle", () => {
    expect(parseProfileNicheQuery(qs("platform=tiktok&handle=%40some.user_1-x"))).toEqual({
      platform: "tiktok",
      handle: "some.user_1-x",
    });
    bad(() => parseProfileNicheQuery(qs("platform=all&handle=x")));
    bad(() => parseProfileNicheQuery(qs("platform=tiktok&handle=")));
    bad(() => parseProfileNicheQuery(qs("platform=tiktok&handle=@")));
    bad(() => parseProfileNicheQuery(qs("platform=tiktok&handle=a/b")));
    bad(() => parseProfileNicheQuery(qs("platform=tiktok&handle=a%20b")));
    bad(() => parseProfileNicheQuery(qs(`platform=tiktok&handle=${"a".repeat(65)}`)));
  });
});

describe("transcript", () => {
  const t = (platform: string, url: string) =>
    parseTranscriptQuery(new URLSearchParams({ platform, url }));

  it("accepts https links on allowed hosts that match the platform", () => {
    expect(t("tiktok", "https://www.tiktok.com/@a/video/1").url).toBe("https://www.tiktok.com/@a/video/1");
    expect(t("tiktok", "https://vm.tiktok.com/ZM123/").platform).toBe("tiktok");
    expect(t("instagram", "https://www.instagram.com/reel/abc/").platform).toBe("instagram");
    expect(t("youtube", "https://youtu.be/abc").platform).toBe("youtube");
    expect(t("youtube", "https://m.youtube.com/shorts/abc").platform).toBe("youtube");
  });

  it("rejects other hosts, schemes and tricks", () => {
    bad(() => t("tiktok", "http://www.tiktok.com/@a/video/1"));
    bad(() => t("tiktok", "https://tiktok.com.evil.com/x"));
    bad(() => t("tiktok", "https://evil.com/?u=https://tiktok.com"));
    bad(() => t("tiktok", "https://user:pw@tiktok.com/x"));
    bad(() => t("tiktok", "https://tiktok.com:8443/x"));
    bad(() => t("tiktok", "javascript:alert(1)"));
    bad(() => t("tiktok", "not a url"));
    bad(() => t("tiktok", "https://www.youtube.com/shorts/abc"));
    bad(() => t("tiktok", `https://www.tiktok.com/${"a".repeat(2100)}`));
    bad(() => parseTranscriptQuery(qs("platform=tiktok")));
  });
});
