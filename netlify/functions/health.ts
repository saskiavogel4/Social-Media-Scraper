import type { Config } from "@netlify/functions";
import type { HealthResponse } from "../../shared/types.ts";

// Reports whether required env vars are set, without ever revealing their values.
export default async (): Promise<Response> => {
  const body: HealthResponse = {
    ok: true,
    apiKeyConfigured: Boolean(process.env.SCRAPE_CREATORS_API_KEY),
    passwordConfigured: Boolean(process.env.APP_ACCESS_PASSWORD),
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/api/health" };
