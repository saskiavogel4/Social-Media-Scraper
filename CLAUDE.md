# NextSociaPost

Web app that finds trending short-form videos (TikTok, Instagram Reels, YouTube Shorts) that fit a creator's niche, using the Scrape Creators API. Deployed to Netlify from `main`.

- **Source of truth:** `docs/PRD.md`. Read it before starting any milestone.
- **Never commit or expose the API key.** It lives only in the `SCRAPE_CREATORS_API_KEY` env var (Netlify / local `.env`) and is used only inside Netlify Functions.

## Expert subagents (`.claude/agents/`)

Delegate to these when a task is in their area:

| Agent | Use for |
|---|---|
| `scrape-creators-api-specialist` | Endpoints, params, response parsing, platform adapters, fixtures, credit cost |
| `netlify-backend-security-engineer` | Netlify Functions, `netlify.toml`, env vars, caching, rate limits, password gate, secrets |
| `frontend-ux-engineer` | React/Tailwind UI, responsiveness, accessibility, loading/error states |
| `trend-growth-strategist` | Trend Score, niche extraction, relevance, ranking defaults |
| `qa-devops-release-engineer` | Tests, CI, lint/typecheck, deploy config, pre-merge review |
