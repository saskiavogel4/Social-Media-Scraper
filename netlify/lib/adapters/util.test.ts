import { describe, expect, it } from "vitest";
import { clockToSeconds, collectHashtags, get, num, parseCount, toIso, vttToText } from "./util.ts";

describe("parseCount", () => {
  it.each([
    ["13,798,774", 13798774],
    ["14,860,541 views", 14860541],
    ["1.2M views", 1200000],
    ["750K", 750000],
    ["2.75M subscribers", 2750000],
    ["1.5K", 1500],
    ["3B", 3000000000],
    ["151957", 151957],
    ["1.234.567", 1234567],
  ])("%s -> %d", (text, expected) => {
    expect(parseCount(text)).toBe(expected);
  });

  it("returns undefined when there is no number", () => {
    expect(parseCount("No views")).toBeUndefined();
    expect(parseCount("")).toBeUndefined();
  });
});

describe("num", () => {
  it("rejects negatives, NaN and non-count types", () => {
    expect(num(-1)).toBeUndefined();
    expect(num(Number.NaN)).toBeUndefined();
    expect(num(null)).toBeUndefined();
    expect(num(true)).toBeUndefined();
    expect(num(0)).toBe(0);
  });
});

describe("toIso", () => {
  it("handles unix seconds, unix ms, numeric strings and ISO strings", () => {
    expect(toIso(1707724682)).toBe("2024-02-12T07:58:02.000Z");
    expect(toIso(1707724682000)).toBe("2024-02-12T07:58:02.000Z");
    expect(toIso("1707724682")).toBe("2024-02-12T07:58:02.000Z");
    expect(toIso("2025-08-07T13:00:22-07:00")).toBe("2025-08-07T20:00:22.000Z");
  });

  it("returns undefined for junk", () => {
    expect(toIso("not a date")).toBeUndefined();
    expect(toIso(0)).toBeUndefined();
    expect(toIso(null)).toBeUndefined();
  });
});

describe("clockToSeconds", () => {
  it("parses m:ss and hh:mm:ss", () => {
    expect(clockToSeconds("4:14")).toBe(254);
    expect(clockToSeconds("00:00:19")).toBe(19);
    expect(clockToSeconds("1:02:03")).toBe(3723);
    expect(clockToSeconds("soon")).toBeUndefined();
  });
});

describe("collectHashtags", () => {
  it("merges explicit tags and caption tags, lower-cased and de-duplicated", () => {
    expect(collectHashtags(["FYP", "#Dog", null], "Cute #dog #Café_2024 #fyp")).toEqual(["fyp", "dog", "café_2024"]);
  });
});

describe("vttToText", () => {
  it("strips the header, cue ids, timings and tags", () => {
    const vtt = "WEBVTT\n\nNOTE generated\n\n1\n00:00:00.000 --> 00:00:01.000\n<c>Hello</c> there\n\n2\n00:00:01.000 --> 00:00:02.000\nworld\n";
    expect(vttToText(vtt)).toBe("Hello there world");
  });

  it("leaves plain text alone (whitespace collapsed)", () => {
    expect(vttToText("  just   text \n here ")).toBe("just text here");
  });
});

describe("get", () => {
  it("never throws on missing paths", () => {
    expect(get({ a: [{ b: 1 }] }, "a", 0, "b")).toBe(1);
    expect(get({ a: [] }, "a", 0, "b")).toBeUndefined();
    expect(get(null, "a")).toBeUndefined();
    expect(get({ a: "str" }, "a", 0)).toBeUndefined();
  });
});
