import { describe, expect, it } from "vitest";
import { PLATFORMS } from "./types.ts";

describe("PLATFORMS", () => {
  it("covers the v1 platforms from the PRD", () => {
    expect(PLATFORMS).toEqual(["tiktok", "instagram", "youtube"]);
  });
});
