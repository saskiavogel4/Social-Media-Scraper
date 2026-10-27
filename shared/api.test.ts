import { describe, expect, it } from "vitest";
import { MAX_TERM_LENGTH, TERM_CHARS, sanitizeTerm } from "./api.ts";

describe("sanitizeTerm", () => {
  it("keeps normal keywords and hashtags", () => {
    expect(sanitizeTerm("  meal   prep ")).toBe("meal prep");
    expect(sanitizeTerm("# book tok")).toBe("#booktok");
    expect(sanitizeTerm("#योग")).toBe("#योग");
  });

  it("drops characters the server rejects", () => {
    expect(sanitizeTerm("cats & dogs 🐶")).toBe("cats dogs");
    expect(sanitizeTerm("before/after")).toBe("before after");
  });

  it("returns empty when nothing searchable is left", () => {
    expect(sanitizeTerm("#")).toBe("");
    expect(sanitizeTerm("🔥🔥")).toBe("");
    expect(sanitizeTerm("--")).toBe("");
  });

  it("caps length and always produces a server-valid term", () => {
    const t = sanitizeTerm("x".repeat(100));
    expect(t.length).toBe(MAX_TERM_LENGTH);
    for (const raw of ["a&b", "#fit 💪 life", "x".repeat(100), "café"]) expect(TERM_CHARS.test(sanitizeTerm(raw))).toBe(true);
  });
});
