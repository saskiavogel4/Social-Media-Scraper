import type { Config } from "@netlify/functions";
import type { TranscriptResponse } from "../../shared/api.ts";
import { adapters } from "../lib/adapters/index.ts";
import { createHandler } from "../lib/handler.ts";
import { errorResponse, json } from "../lib/http.ts";
import { parseTranscriptQuery } from "../lib/validate.ts";

// GET /api/transcript?platform=&url=  (fetched only on demand: each call costs credits)
export default createHandler(async ({ params, sc }) => {
  const { platform, url } = parseTranscriptQuery(params);
  let transcript: string | null;
  try {
    transcript = await adapters[platform].transcript(sc(), url);
  } catch (err) {
    return errorResponse(err, { platform });
  }
  const body: TranscriptResponse = { transcript: typeof transcript === "string" ? transcript : null };
  return json(body);
});

export const config: Config = { path: "/api/transcript" };
