import type { Config } from "@netlify/functions";
import type { SessionResponse } from "../../shared/api.ts";
import { createHandler } from "../lib/handler.ts";
import { json } from "../lib/http.ts";
import { parseEmptyQuery } from "../lib/validate.ts";

// Lets the UI check the access password. Not rate limited (but failed attempts are).
export default createHandler(
  async ({ params }) => {
    parseEmptyQuery(params);
    const body: SessionResponse = { ok: true };
    return json(body);
  },
  { rateLimited: false },
);

export const config: Config = { path: "/api/session" };
