# NextSociaPost

Find trending TikToks, Instagram Reels and YouTube Shorts that fit your niche, powered by the [Scrape Creators API](https://docs.scrapecreators.com).

See [`docs/PRD.md`](docs/PRD.md) for the full product requirements.

## Local development

```bash
npm install
cp .env.example .env      # then fill in your values (never commit .env)
npx netlify dev           # runs the site + functions at http://localhost:8888
```

`npm run dev` runs the frontend only (the `/api/*` functions won't be available).

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run check:secrets
npx playwright install chromium   # once, if you don't have Playwright's Chromium yet
npm run test:e2e                  # Playwright smoke tests against `vite preview`
```

Unit tests (Vitest) use recorded fixtures and the e2e tests mock every `/api/*` call, so no check ever calls Scrape Creators or needs a real key. `check:secrets` scans the built bundle; if `SCRAPE_CREATORS_API_KEY` is set it also scans tracked files and the full git history for the key value. CI (`.github/workflows/ci.yml`) runs all of the above on every PR and push to `main`.

## Release checklist (merging to `main`)

1. CI is green on the PR (both the `check` and `e2e` jobs).
2. Open the Netlify deploy preview, enter the access password, then run one niche search, open a video's details and save it. Each search on the preview uses real credits, so keep it to one or two.
3. If the PR touches `netlify.toml`, `netlify/functions` or env vars: check `/api/health` on the preview reports `apiKeyConfigured` and `passwordConfigured` as `true`, and the deploy log lists only the six functions (`health`, `profile-niche`, `search`, `session`, `transcript`, `trending`).
4. Check the diff for anything that sends the key, the password or upstream response bodies to the browser or the logs.
5. Merge. Netlify deploys `main` to production. Then repeat step 2 on the production URL.

## Deploying to Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub** and pick this repo. Build settings are read from `netlify.toml`.
2. Set the production branch to `main`.
3. Under **Site configuration → Environment variables**, add:
   - `SCRAPE_CREATORS_API_KEY`: your Scrape Creators API key
   - `APP_ACCESS_PASSWORD`: a password you'll share with people allowed to use the app
   - Optional: `RATE_LIMIT_PER_HOUR` (searches per visitor per hour, default 30) and `CALL_LIMIT_PER_HOUR` (uncached Scrape Creators calls per visitor per hour, roughly credits, default 60)
4. Deploy. Visit the site: enter the access password and run a search.

The API key is only ever read inside Netlify Functions; it is never sent to the browser.
