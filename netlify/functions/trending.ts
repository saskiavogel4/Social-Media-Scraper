import type { Config } from "@netlify/functions";
import type { VideosResponse } from "../../shared/api.ts";
import type { Video } from "../../shared/types.ts";
import { dedupeVideos, filterVideos, scoreVideos } from "../../shared/scoring.ts";
import { adapters } from "../lib/adapters/index.ts";
import { MAX_RESULTS, collectByPlatform, createHandler, platformsFor, worstError } from "../lib/handler.ts";
import { json } from "../lib/http.ts";
import { parseTrendingQuery } from "../lib/validate.ts";

// GET /api/trending?platform=&window=&minViews=
export default createHandler(async ({ params, sc }) => {
  const query = parseTrendingQuery(params);
  const client = sc();
  const tasks = platformsFor(query.platform).map((platform) => ({
    platform,
    run: () => adapters[platform].trending(client),
  }));
  const { results, errors, allFailed } = await collectByPlatform<Video[]>(tasks);
  if (allFailed) return worstError(errors);

  const filtered = filterVideos(dedupeVideos(results.flat()), { window: query.window, minViews: query.minViews });
  const videos = scoreVideos(filtered)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, MAX_RESULTS);
  const body: VideosResponse = { videos, errors };
  return json(body);
});

export const config: Config = { path: "/api/trending" };
