import { useCallback, useEffect, useState } from "react";
import type { Video } from "../shared/types.ts";
import { sanitizeTerm } from "../shared/api.ts";
import { onUnauthorized } from "./api.ts";
import { AppHeader, type View } from "./components/AppHeader.tsx";
import { PasswordGate } from "./components/PasswordGate.tsx";
import { ResultsView } from "./components/ResultsView.tsx";
import { SavedIdeas } from "./components/SavedIdeas.tsx";
import { INITIAL_FORM, SearchForm, type FormState } from "./components/SearchForm.tsx";
import { VideoDrawer } from "./components/VideoDrawer.tsx";
import { useSavedVideos } from "./hooks/useSavedVideos.ts";
import { useVideoSearch, type SearchQuery } from "./hooks/useVideoSearch.ts";
import { clearPassword, getPassword, setPassword } from "./lib/storage.ts";

export default function App() {
  const [authed, setAuthed] = useState(() => !!getPassword());
  const [expired, setExpired] = useState(false);

  // Any 401 from the API clears the stored password and returns to the gate.
  useEffect(() => {
    onUnauthorized(() => {
      clearPassword();
      setExpired(true);
      setAuthed(false);
    });
    return () => onUnauthorized(null);
  }, []);

  if (!authed) {
    return (
      <PasswordGate
        expired={expired}
        onSuccess={(pw) => {
          setPassword(pw);
          setExpired(false);
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <MainApp
      onSignOut={() => {
        clearPassword();
        setExpired(false);
        setAuthed(false);
      }}
    />
  );
}

function MainApp({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState<View>("search");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [selected, setSelected] = useState<Video | null>(null);
  const saved = useSavedVideos();
  const search = useVideoSearch();

  const patchForm = useCallback((patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch })), []);

  const runSearch = (terms: string[]) =>
    void search.run({ kind: "search", platform: form.platform, terms, window: form.window, minViews: form.minViews });

  const runTrending = () =>
    void search.run({ kind: "trending", platform: form.platform, terms: [], window: form.window, minViews: form.minViews });

  const retry = (q: SearchQuery) => void search.run(q);

  const searchHashtag = (rawTag: string, video: Video) => {
    const tag = sanitizeTerm(rawTag);
    if (!tag) return;
    setSelected(null);
    setView("search");
    setForm((f) => ({ ...f, platform: video.platform, mode: "niche", terms: [tag] }));
    void search.run({ kind: "search", platform: video.platform, terms: [tag], window: form.window, minViews: form.minViews });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-violet-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppHeader view={view} onViewChange={setView} savedCount={saved.saved.length} onSignOut={onSignOut} />

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
        {view === "search" ? (
          <div className="space-y-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                Find what's trending in your niche
              </h1>
              <p className="mb-5 text-slate-600 dark:text-slate-400">
                Proven short-form ideas from TikTok, Instagram Reels and YouTube Shorts.
              </p>
              <SearchForm
                form={form}
                onChange={patchForm}
                onSearch={runSearch}
                onTrending={runTrending}
                busy={search.state.status === "loading"}
              />
            </div>
            <ResultsView state={search.state} saved={saved} onOpen={setSelected} onRetry={retry} />
          </div>
        ) : (
          <SavedIdeas saved={saved} onOpen={setSelected} onGoSearch={() => setView("search")} />
        )}
      </main>

      <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
        Data via Scrape Creators. Videos belong to their creators; links open the original posts.
      </footer>

      {selected && (
        <VideoDrawer
          video={selected}
          saved={saved.isSaved(selected)}
          onToggleSave={saved.toggle}
          onClose={() => setSelected(null)}
          onHashtag={searchHashtag}
        />
      )}
    </div>
  );
}
