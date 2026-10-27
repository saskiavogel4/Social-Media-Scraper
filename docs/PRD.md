# Product Requirements Document: NextSocialPost

**Status:** Draft v1 · **Owner:** Saskia Vogel · **Last updated:** 2026-10-27

---

## 1. Summary

NextSocialPost is a web app that helps social media creators find **trending short-form videos that fit their own account**. The user picks a platform and gives the app their niche, their handle, or both. The app then uses the [Scrape Creators API](https://docs.scrapecreators.com) to find popular videos in that niche and shows them in a ranked grid with engagement stats, so the creator can quickly spot content ideas worth making their own version of.

The app is built from this GitHub repository and deployed to **Netlify**. Every merge to `main` deploys to production.

## 2. Problem

Creators lose hours scrolling TikTok, Instagram and YouTube to find out what's working in their niche. Platform "For You" feeds are personalised and noisy, they don't show cross-platform trends side by side, and they give no quick way to compare videos by engagement. Creators need one place that answers: *"What's blowing up right now in my niche, and what should I make next?"*

## 3. Goals and non-goals

### Goals (v1)
1. Find trending or popular videos for a niche on **TikTok, Instagram Reels and YouTube Shorts**.
2. Let the user describe their niche with **keywords or hashtags**, *or* by entering their **handle** so the app can work out the niche automatically.
3. Rank results by an engagement-based **Trend Score** and show key stats at a glance.
4. Keep the Scrape Creators API key **server-side only**. It must never reach the browser or the git repo.
5. Use API credits carefully through caching and request limits.
6. Deploy to Netlify with zero manual steps after setup.

### Non-goals (v1)
- User accounts, logins, or a multi-user SaaS with billing.
- Downloading or reposting other creators' videos.
- Posting to or scheduling on social platforms.
- Platforms beyond TikTok, Instagram and YouTube (see Future ideas).
- AI-generated scripts or captions (see Future ideas).

## 4. Target user

**Primary persona: "the solo creator."** Someone running one or two creator accounts (for example a fitness coach, a travel creator or a small-business owner) who posts short-form video several times a week and wants fresh, proven ideas fast. They aren't technical. The app must work without any setup on their side.

People create their own account with an email address and password (see §8.3).

## 5. User stories

| # | As a creator, I want to… | So that… |
|---|---|---|
| US-1 | pick a platform (TikTok, Instagram or YouTube Shorts, or all of them) | I only see results relevant to where I post |
| US-2 | type niche keywords or hashtags (e.g. "meal prep", `#booktok`) | I get trending videos in my topic |
| US-3 | enter my handle (e.g. `@myaccount`) | the app works out my niche from my recent posts, so I don't have to describe it |
| US-4 | see results ranked by how well they're performing | the strongest ideas are at the top |
| US-5 | see the thumbnail, caption, creator, views, likes, comments, shares and post date for each video | I can judge a video without opening it |
| US-6 | sort and filter by recency, views or engagement rate | I can focus on what's fresh, not just what's big |
| US-7 | open the original video in a new tab | I can watch it on the platform |
| US-8 | view a video's transcript (where available) | I can quickly understand the hook and structure |
| US-9 | save videos to a "Saved ideas" list | I can come back to them when I plan content |
| US-10 | browse a general trending feed for a platform without a niche | I can catch broad trends and sounds |

## 6. Functional requirements

### 6.1 Search input
- **FR-1** Platform selector: `TikTok`, `Instagram`, `YouTube Shorts`, `All`.
- **FR-2** Niche mode: free-text keywords or hashtags. Several terms can be entered as chips, with a maximum of 5 per search.
- **FR-3** Handle mode: enter a handle for the selected platform. The app fetches that profile's recent posts, pulls out the most frequent hashtags and keywords, shows them to the user as editable chips, and then runs a niche search.
- **FR-4** Optional filters: time window (e.g. 24h, 7 days, 30 days, any) where the source endpoint supports it, and a minimum view count.

### 6.2 Data retrieval (Scrape Creators endpoints)
All calls go through Netlify Functions to `https://api.scrapecreators.com` with the `x-api-key` header.

| Need | TikTok | Instagram | YouTube |
|---|---|---|---|
| General trending | `/v1/tiktok/get-trending-feed` | `/v1/instagram/reels/trending` | `/v1/youtube/shorts/trending` |
| Search by keyword | `/v1/tiktok/search/keyword`, `/v1/tiktok/search/top` | `/v2/instagram/reels/search` | `/v1/youtube/search` |
| Search by hashtag | `/v1/tiktok/search/hashtag` | `/v1/instagram/search/hashtag` | `/v1/youtube/search/hashtag` |
| Profile, for niche detection | `/v1/tiktok/profile`, `/v3/tiktok/profile/videos` | `/v1/instagram/profile`, `/v1/instagram/user/reels` | `/v1/youtube/channel`, `/v1/youtube/channel/shorts` |
| Transcript | `/v1/tiktok/video/transcript` | `/v2/instagram/media/transcript` | `/v1/youtube/video/transcript` |

> Exact query parameters and response shapes must be checked against the live docs during implementation. Each platform adapter must normalise responses into the shared `Video` model (§6.3).

### 6.3 Normalised data model
```ts
type Platform = "tiktok" | "instagram" | "youtube";

interface Video {
  id: string;
  platform: Platform;
  url: string;              // link to the original post
  thumbnailUrl: string;
  caption: string;
  hashtags: string[];
  author: { handle: string; displayName?: string; followers?: number; avatarUrl?: string };
  stats: { views?: number; likes?: number; comments?: number; shares?: number };
  postedAt?: string;        // ISO 8601
  durationSec?: number;
  soundName?: string;
  trendScore: number;       // computed, 0–100
}
```

### 6.4 Ranking: Trend Score
- **FR-5** Each video gets a `trendScore` (0–100) based on:
  - **Engagement rate:** (likes + comments + shares) ÷ views.
  - **Velocity:** views ÷ hours since posting (newer videos get a boost).
  - **Outperformance:** views ÷ author followers, where follower counts are available (a small creator going viral is a stronger signal).
- Missing values are left out of the calculation rather than treated as zero. The weights are kept in one config file so they're easy to tune.

### 6.5 Results UI
- **FR-6** A responsive card grid with thumbnail, platform badge, caption (truncated), creator handle, formatted stats (e.g. 1.2M), post age (e.g. "3d ago") and a Trend Score badge.
- **FR-7** Sort by Trend Score (default), views, engagement rate or newest.
- **FR-8** Video detail drawer: full caption, hashtags (clicking one starts a new search), sound name, and a "Load transcript" button. Transcripts are fetched only on request because each one costs credits.
- **FR-9** "Open on platform" link that opens in a new tab with `rel="noopener noreferrer"`.
- **FR-10** Loading skeletons, empty states, and clear error messages (e.g. "Out of API credits", "Profile not found or private").

### 6.6 Saved ideas
- **FR-11** Save or unsave a video. In v1, saved items are stored in the browser's `localStorage`, with no account needed.
- **FR-12** A "Saved ideas" view with an export to CSV option.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | First search results in under 5 s for a single platform (p75). Pages are static and served from Netlify's CDN. |
| **Responsiveness** | Usable at 360 px phone width and up. No horizontal scrolling. |
| **Accessibility** | Meets WCAG 2.1 AA: keyboard-navigable, alt text on thumbnails, sufficient contrast. |
| **Reliability** | Each platform call fails on its own. If one platform errors in "All" mode, the others still show. |
| **Browser support** | Latest 2 versions of Chrome, Safari, Firefox and Edge. |

## 8. Security, cost and compliance

### 8.1 API key handling
- The key is stored **only** as the Netlify environment variable `SCRAPE_CREATORS_API_KEY`.
- It is never committed. `.env` is gitignored, and `.env.example` documents the variable name only.
- It is never sent to the browser. The frontend calls only `/.netlify/functions/*` (or `/api/*`).

### 8.2 Credit protection
- **Caching:** identical requests are cached server-side (Netlify Blobs) for 30–60 minutes for trending and search results, and 24 h for transcripts and profiles.
- **Rate limiting:** each IP gets a maximum number of searches per hour (configurable).
- **Allow-listed proxy:** the function only forwards requests to a fixed list of endpoints (§6.2) and checks every parameter. It is not an open proxy.
- When the API returns `402`, a friendly "Out of credits" message is shown.

### 8.3 Access control
- Users sign up and sign in with email + password via Supabase Auth (email confirmation on by default). Every `/api/*` request carries the user's Supabase access token, which the functions verify with Supabase before calling Scrape Creators. Search and credit limits apply per account.

### 8.4 Compliance
- Only public data is shown. The app links to the original posts and does not rehost or download videos.
- A footer note credits each platform and creator.

## 9. Technical architecture

```
Browser (React SPA)
   │  fetch /api/search, /api/trending, /api/profile-niche, /api/transcript
   ▼
Netlify Functions (TypeScript)
   ├─ auth check (Supabase access token)
   ├─ rate limit + cache (Netlify Blobs)
   ├─ platform adapters → normalise to Video
   └─ trend scoring
   │  x-api-key: $SCRAPE_CREATORS_API_KEY
   ▼
Scrape Creators API (api.scrapecreators.com)
```

- **Frontend:** Vite + React + TypeScript + Tailwind CSS.
- **Backend:** Netlify Functions (TypeScript), with shared types between frontend and functions.
- **Storage:** Netlify Blobs for cache and rate limits. `localStorage` for saved ideas.
- **Testing:** Vitest for unit tests (adapters, scoring, niche extraction), with recorded API fixtures so tests never spend credits. Playwright smoke test for the main search flow.
- **CI/CD:** GitHub Actions runs lint, typecheck and tests on every PR. Netlify deploys a preview for each PR and deploys `main` to production.
- **Config:** `netlify.toml` defines the build command, publish directory, functions directory and `/api/*` redirects.

## 10. Success metrics
- A user goes from opening the app to seeing relevant results in **under 30 seconds**.
- **At least 70% of results** are judged on-niche in manual spot checks of 10 test niches.
- Average **API credits per search ≤ 3** for a single platform, after caching.
- **Zero** occurrences of the API key in the client bundle or the git history (checked in CI).

## 11. Milestones

| # | Milestone | Deliverable |
|---|---|---|
| M1 | Foundation | Repo scaffold, Netlify config, env handling, CI, deploy of a "hello" page |
| M2 | API layer | Netlify Functions, allow-listed Scrape Creators client, caching, rate limits, password gate |
| M3 | Platform adapters | TikTok, Instagram and YouTube adapters normalised to `Video`, with fixture tests |
| M4 | Search UI | Search form, results grid, sorting and filters, Trend Score |
| M5 | Handle mode | Profile fetch, niche extraction, editable keyword chips |
| M6 | Details & saved | Detail drawer, transcripts, saved ideas, CSV export |
| M7 | Polish & launch | Accessibility pass, error states, docs, production deploy from `main` |

## 12. Open questions
1. Which time-window filters does each Scrape Creators search endpoint actually support? (To verify in M3.)
2. Should "All platforms" mode be the default, given it costs about 3× the credits?
3. ~~Is the shared password enough for v1?~~ Replaced by per-user email + password accounts (Supabase Auth).
4. What's the monthly credit budget? This decides the cache lengths and rate limits.

## 13. Future ideas (post-v1)
- AI "remix" suggestions: turn a trending video's transcript into a hook and outline for the user's niche.
- More platforms: Facebook video search, Threads, Pinterest, Reddit.
- Trending sounds tracker (TikTok song endpoints, Instagram reels-by-audio).
- Scheduled daily email digest of new trends in the user's niche.
- Accounts with saved ideas synced across devices.
