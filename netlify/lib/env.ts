// Reads the Scrape Creators key from the environment, forgiving common dashboard slips
// (stray spaces or lowercase in the variable name, spaces or quotes around the value).
// Also checks Netlify's runtime env API in case a variable isn't mirrored into process.env.

export const SCRAPE_KEY_NAME = "SCRAPE_CREATORS_API_KEY";

type NetlifyGlobal = { env?: { get?: (name: string) => string | undefined; toObject?: () => Record<string, string> } };

function netlifyEnv(): Record<string, string> {
  try {
    const nf = (globalThis as { Netlify?: NetlifyGlobal }).Netlify;
    return nf?.env?.toObject?.() ?? {};
  } catch {
    return {};
  }
}

function allEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  // process.env wins; Netlify.env only fills gaps. Tests pass `env` explicitly and skip Netlify.env.
  return env === process.env ? { ...netlifyEnv(), ...env } : env;
}

const normaliseName = (name: string) => name.trim().toUpperCase().replace(/[\s-]+/g, "_");

function cleanValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

export function scrapeCreatorsKey(env: NodeJS.ProcessEnv = process.env): string {
  const vars = allEnv(env);
  const exact = cleanValue(vars[SCRAPE_KEY_NAME]);
  if (exact) return exact;
  for (const [name, value] of Object.entries(vars)) {
    if (normaliseName(name) === SCRAPE_KEY_NAME && cleanValue(value)) return cleanValue(value);
  }
  return "";
}

/**
 * Names (never values) of variables that look like an attempt at the key, for /api/health
 * when the key can't be found — e.g. a typo such as "SCRAPECREATORS_API_KEY".
 */
export function lookalikeKeyNames(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(allEnv(env))
    .filter((name) => /scrape|creator/i.test(name) || /^\s*api[_\s-]*key\s*$/i.test(name))
    .filter((name) => !/^(VITE_)?SUPABASE_/i.test(name))
    .slice(0, 10)
    .map((name) => JSON.stringify(name));
}
