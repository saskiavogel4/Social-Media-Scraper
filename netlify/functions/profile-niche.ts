import type { Config } from "@netlify/functions";
import type { ProfileNicheResponse } from "../../shared/api.ts";
import { extractNicheTerms } from "../../shared/niche.ts";
import { adapters } from "../lib/adapters/index.ts";
import { createHandler } from "../lib/handler.ts";
import { errorResponse, json } from "../lib/http.ts";
import { parseProfileNicheQuery } from "../lib/validate.ts";

// GET /api/profile-niche?platform=&handle=
export default createHandler(async ({ params, sc }) => {
  const { platform, handle } = parseProfileNicheQuery(params);
  let profile;
  try {
    profile = await adapters[platform].profile(sc(), handle);
  } catch (err) {
    return errorResponse(err, { platform, lookup: "profile" });
  }
  const body: ProfileNicheResponse = {
    platform,
    handle: profile.handle || handle,
    terms: extractNicheTerms(profile.videos, 5),
    sampleSize: profile.videos.length,
  };
  if (typeof profile.followers === "number") body.followers = profile.followers;
  return json(body);
});

export const config: Config = { path: "/api/profile-niche" };
