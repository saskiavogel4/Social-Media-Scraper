import type { Config } from "@netlify/functions";
import type { HealthResponse } from "../../shared/types.ts";
import { lookalikeKeyNames, scrapeCreatorsKey } from "../lib/env.ts";

// Reports whether required env vars are set, without ever revealing their values.
// When the key is missing it also lists look-alike variable *names* and which deploy is
// running, to help spot a typo or a deploy that predates the variable.
export default async (): Promise<Response> => {
  const apiKeyConfigured = Boolean(scrapeCreatorsKey());
  const body: HealthResponse = apiKeyConfigured
    ? { ok: true, apiKeyConfigured }
    : {
        ok: true,
        apiKeyConfigured,
        lookalikeVariableNames: lookalikeKeyNames(),
        deployContext: process.env.CONTEXT ?? null,
        deployId: process.env.DEPLOY_ID ?? null,
      };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/api/health" };
