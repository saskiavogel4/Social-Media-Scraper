// Fails if the Scrape Creators API key could leak to the browser or the repo.
// 1. The built bundle (dist/) must exist and never mention the upstream API host or the key's env var name.
// 2. If SCRAPE_CREATORS_API_KEY is set, its value must not appear in tracked files, dist/,
//    or anywhere in the git history (all refs, including commit messages). The value is never printed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const problems = [];
const notes = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

if (!existsSync("dist")) {
  console.error("Secret check failed: dist/ not found. Run `npm run build` first so the client bundle can be scanned.");
  process.exit(1);
}
const distFiles = walk("dist");
for (const file of distFiles) {
  const text = readFileSync(file, "utf8");
  for (const needle of ["api.scrapecreators.com", "SCRAPE_CREATORS_API_KEY"]) {
    if (text.includes(needle)) problems.push(`${file} contains "${needle}" (client bundle must not reference the API directly)`);
  }
}

const key = process.env.SCRAPE_CREATORS_API_KEY?.trim();
if (key && key.length < 8) {
  notes.push("SCRAPE_CREATORS_API_KEY is too short to scan for reliably; value checks skipped");
} else if (key) {
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  for (const file of [...tracked, ...distFiles]) {
    if (existsSync(file) && statSync(file).isFile() && readFileSync(file, "utf8").includes(key)) {
      problems.push(`${file} contains the API key value`);
    }
  }

  if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") {
    notes.push("shallow clone: git history only partly scanned (use fetch-depth: 0)");
  }
  const history = git(["log", "--all", "-p", "--text", "--no-color", "--no-ext-diff", "--format=%H%n%B"]);
  if (history.includes(key)) {
    problems.push("the API key value appears in git history (rotate the key, then rewrite history)");
  }
}

if (problems.length) {
  console.error("Secret check failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
const scope = key && key.length >= 8 ? ", key value checked in files, bundle and git history" : "";
console.log(`Secret check passed (${distFiles.length} bundle files scanned${scope}).`);
for (const note of notes) console.warn(`Note: ${note}`);
