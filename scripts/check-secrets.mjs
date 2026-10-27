// Fails if the Scrape Creators API key could leak to the browser or the repo.
// 1. The built bundle (dist/) must never mention the upstream API host or the key's env var name.
// 2. If SCRAPE_CREATORS_API_KEY is set, its value must not appear in tracked files or dist/.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const distFiles = existsSync("dist") ? walk("dist") : [];
for (const file of distFiles) {
  const text = readFileSync(file, "utf8");
  for (const needle of ["api.scrapecreators.com", "SCRAPE_CREATORS_API_KEY"]) {
    if (text.includes(needle)) problems.push(`${file} contains "${needle}" (client bundle must not reference the API directly)`);
  }
}

const key = process.env.SCRAPE_CREATORS_API_KEY;
if (key) {
  const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const file of [...tracked, ...distFiles]) {
    if (existsSync(file) && readFileSync(file, "utf8").includes(key)) problems.push(`${file} contains the API key value`);
  }
}

if (problems.length) {
  console.error("Secret check failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Secret check passed (${distFiles.length} bundle files scanned${key ? ", key value checked" : ""}).`);
