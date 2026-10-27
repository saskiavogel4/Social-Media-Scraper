import { describe, expect, it } from "vitest";
import type { Video } from "../../shared/types.ts";
import { escapeCsvField, videosToCsv } from "./csv.ts";

describe("escapeCsvField", () => {
  it("leaves plain values alone", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
  });

  it("renders missing values as empty", () => {
    expect(escapeCsvField(undefined)).toBe("");
    expect(escapeCsvField(null)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField("cr\r\nlf")).toBe('"cr\r\nlf"');
  });

  it("neutralises spreadsheet formulas in text", () => {
    expect(escapeCsvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvField("+1")).toBe("'+1");
    expect(escapeCsvField("@user")).toBe("'@user");
    expect(escapeCsvField(-5)).toBe("-5");
  });
});

describe("videosToCsv", () => {
  const video: Video = {
    id: "1",
    platform: "instagram",
    url: "https://www.instagram.com/reel/abc/",
    thumbnailUrl: "",
    caption: 'Meal prep, "easy" edition\n#mealprep',
    hashtags: ["mealprep"],
    author: { handle: "chef" },
    stats: { views: 1000, likes: 100 },
    postedAt: "2026-10-20T10:00:00.000Z",
    trendScore: 87,
  };

  it("writes the header and escaped rows", () => {
    const csv = videosToCsv([video]);
    const [header, ...rest] = csv.split("\r\n");
    expect(header).toBe("platform,url,caption,handle,views,likes,comments,shares,trendScore,postedAt");
    expect(rest.join("\r\n")).toBe(
      'instagram,https://www.instagram.com/reel/abc/,"Meal prep, ""easy"" edition\n#mealprep",chef,1000,100,,,87,2026-10-20T10:00:00.000Z\r\n',
    );
  });

  it("writes only the header for an empty list", () => {
    expect(videosToCsv([])).toBe("platform,url,caption,handle,views,likes,comments,shares,trendScore,postedAt\r\n");
  });
});
