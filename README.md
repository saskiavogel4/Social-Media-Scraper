# Trend Scout

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
```

## Deploying to Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub** and pick this repo. Build settings are read from `netlify.toml`.
2. Set the production branch to `main`.
3. Under **Site configuration → Environment variables**, add:
   - `SCRAPE_CREATORS_API_KEY`: your Scrape Creators API key
   - `APP_ACCESS_PASSWORD`: a password you'll share with people allowed to use the app
4. Deploy. Visit the site: the setup status card should show all green checks.

The API key is only ever read inside Netlify Functions; it is never sent to the browser.
