import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Video } from "../shared/types.ts";
import { sanitizeTerm } from "../shared/api.ts";
import { onUnauthorized } from "./api.ts";
import { AppHeader, type View } from "./components/AppHeader.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { AuthScreen } from "./components/AuthScreen.tsx";
import { ProfileForm } from "./components/ProfileForm.tsx";
import { ProfileMenu } from "./components/ProfileMenu.tsx";
import { ProfileSetup } from "./components/ProfileSetup.tsx";
import { ResultsView } from "./components/ResultsView.tsx";
import { SavedIdeas } from "./components/SavedIdeas.tsx";
import { SearchForm, formFromProfile, formPatchForProfileEdit, type FormState } from "./components/SearchForm.tsx";
import { VideoDrawer } from "./components/VideoDrawer.tsx";
import { DensityContext } from "./hooks/useDensity.ts";
import { useProfiles, type Profiles } from "./hooks/useProfiles.ts";
import { useSavedVideos } from "./hooks/useSavedVideos.ts";
import { useVideoSearch, type SearchQuery } from "./hooks/useVideoSearch.ts";
import { applyAppearance } from "./lib/appearance.ts";
import { DEFAULT_DRAFT, ProfileError, appearanceOf, type Appearance, type Profile, type ProfileDraft } from "./lib/profiles.ts";
import { describeRedirectError } from "./lib/authErrors.ts";
import { clearLegacyPassword } from "./lib/storage.ts";
import { signOutLocally, supabase } from "./lib/supabase.ts";
import { Spinner } from "./components/ui.tsx";

type AuthState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; userId: string };

const SESSION_ENDED = { title: "Please sign in again", detail: "Your session ended, so you were signed out." };

/** Removes Supabase's redirect leftovers (`#access_token=…`, `#error=…` or a bare `#`) from the address bar. */
function cleanAuthRedirectFromUrl(): void {
  const { hash, href, pathname, search } = window.location;
  const leftover = href.endsWith("#") || /(^|[#&])(access_token|refresh_token|error|error_code)=/.test(hash);
  if (leftover) window.history.replaceState(window.history.state, "", `${pathname}${search}`);
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [notice, setNotice] = useState<{ title: string; detail: string } | null>(() => {
    // An expired or reused confirmation link comes back as #error=…; read it before the URL is cleaned.
    const detail = describeRedirectError(window.location.hash);
    return detail ? { title: "That link didn't work", detail } : null;
  });

  useEffect(() => {
    clearLegacyPassword();
    let active = true;
    const apply = (session: Session | null) => {
      if (!active) return;
      const userId = session?.user?.id;
      // Keep the same object while the user is unchanged (token refreshes shouldn't re-render the app).
      setAuth((prev) =>
        userId
          ? prev.status === "signed-in" && prev.userId === userId
            ? prev
            : { status: "signed-in", userId }
          : prev.status === "signed-out"
            ? prev
            : { status: "signed-out" },
      );
    };
    // getSession waits for supabase-js to finish reading a confirmation link from the URL.
    void supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null))
      .finally(cleanAuthRedirectFromUrl);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Any 401 from the API signs this browser out and returns to the sign-in screen.
  useEffect(() => {
    onUnauthorized(() => {
      setNotice(SESSION_ENDED);
      setAuth({ status: "signed-out" });
      void signOutLocally();
    });
    return () => onUnauthorized(null);
  }, []);

  if (auth.status === "loading") {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-accent-700 dark:text-accent-300">
        <Spinner className="h-6 w-6" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (auth.status === "signed-out") return <AuthScreen notice={notice} />;

  return (
    <ProfilesApp
      key={auth.userId}
      onSignOut={() => {
        setNotice(null);
        setAuth({ status: "signed-out" });
        void signOutLocally();
      }}
    />
  );
}

/** Applies the active profile's look (or the profile form's live preview) and picks setup vs. the main app. */
function ProfilesApp({ onSignOut }: { onSignOut: () => void }) {
  const profiles = useProfiles();
  const active = profiles.active;
  const [preview, setPreview] = useState<Appearance | null>(null);
  // After switching, creating or deleting from the menu, focus lands on the (re-mounted) profile menu button.
  const [focusMenu, setFocusMenu] = useState(false);
  const { theme, accent, density } = preview ?? appearanceOf(active);

  const fromMenu = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A): R => {
    setFocusMenu(true);
    return fn(...args);
  };
  const menuProfiles: Profiles = {
    ...profiles,
    create: fromMenu(profiles.create),
    switchTo: fromMenu(profiles.switchTo),
    remove: fromMenu(profiles.remove),
  };

  useEffect(() => applyAppearance({ theme, accent, density }), [theme, accent, density]);

  return (
    <DensityContext value={density}>
      {active ? (
        // Keyed by profile: switching profile starts a fresh workspace with that profile's defaults and saved ideas.
        <MainApp key={active.id} profile={active} profiles={menuProfiles} focusMenu={focusMenu} onPreview={setPreview} onSignOut={onSignOut} />
      ) : (
        <ProfileSetup
          onCreate={(draft) => {
            setFocusMenu(false);
            profiles.create(draft);
          }}
          onPreview={setPreview}
          onSignOut={onSignOut}
        />
      )}
    </DensityContext>
  );
}

type Screen = "edit-profile" | "new-profile" | null;

interface MainAppProps {
  profile: Profile;
  profiles: Profiles;
  /** Focus the profile menu button on mount (after a profile switch). */
  focusMenu: boolean;
  onPreview: (a: Appearance | null) => void;
  onSignOut: () => void;
}

function MainApp({ profile, profiles, focusMenu, onPreview, onSignOut }: MainAppProps) {
  const [view, setView] = useState<View>("search");
  const [screen, setScreen] = useState<Screen>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => formFromProfile(profile));
  const [prevProfile, setPrevProfile] = useState(profile);
  const [selected, setSelected] = useState<Video | null>(null);
  const saved = useSavedVideos(profile.id);
  const search = useVideoSearch();
  const screenHeadingRef = useRef<HTMLHeadingElement>(null);

  // Editing the active profile: carry changed search defaults into the form.
  if (prevProfile !== profile) {
    setPrevProfile(profile);
    setForm((f) => ({ ...f, ...formPatchForProfileEdit(prevProfile, profile, f) }));
  }

  // Opening a profile screen: start at the top. Editing focuses the heading; a new profile focuses its name field.
  useEffect(() => {
    if (!screen) return;
    window.scrollTo({ top: 0 });
    if (screen === "edit-profile") screenHeadingRef.current?.focus();
  }, [screen]);

  const openScreen = (s: Screen) => {
    setProfileError(null);
    setScreen(s);
  };

  const goTo = (v: View) => {
    setScreen(null);
    setView(v);
  };

  const saveProfile = (draft: ProfileDraft) => {
    try {
      if (screen === "new-profile") {
        profiles.create(draft); // becomes active; this component remounts for the new profile
      } else {
        profiles.update(profile.id, draft);
        setScreen(null);
      }
    } catch (err) {
      setProfileError(err instanceof ProfileError ? err.message : "Couldn't save the profile. Please try again.");
    }
  };

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
        className="sr-only z-50 rounded-lg bg-accent-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppHeader
        view={screen ? null : view}
        onViewChange={goTo}
        savedCount={saved.saved.length}
        onSignOut={onSignOut}
        profileMenu={
          <ProfileMenu
            autoFocus={focusMenu}
            active={profile}
            profiles={profiles.profiles}
            onEdit={() => openScreen("edit-profile")}
            onNew={() => openScreen("new-profile")}
            onSwitch={profiles.switchTo}
            onDelete={() => setConfirmDelete(true)}
          />
        }
      />

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
        {screen ? (
          <section aria-labelledby="profile-screen-heading" className="mx-auto max-w-2xl">
            <h1
              id="profile-screen-heading"
              ref={screenHeadingRef}
              tabIndex={-1}
              className="mb-1 text-2xl font-bold tracking-tight text-slate-900 focus:outline-none sm:text-3xl dark:text-white"
            >
              {screen === "edit-profile" ? "Edit profile" : "New profile"}
            </h1>
            <p className="mb-5 text-slate-600 dark:text-slate-400">
              {screen === "edit-profile"
                ? "Tune your niche, search defaults and how the app looks. Look-and-feel changes preview instantly."
                : "Each profile has its own niche, look and saved ideas."}
            </p>
            <ProfileForm
              key={screen}
              initial={screen === "edit-profile" ? profile : DEFAULT_DRAFT}
              expanded={screen === "edit-profile"}
              submitLabel={screen === "edit-profile" ? "Save changes" : "Create profile"}
              onSubmit={saveProfile}
              onCancel={() => setScreen(null)}
              onPreview={onPreview}
              submitError={profileError}
              autoFocusName={screen === "new-profile"}
            />
          </section>
        ) : view === "search" ? (
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
            <ResultsView state={search.state} saved={saved} onOpen={setSelected} onRetry={retry} defaultSort={profile.defaultSort} />
          </div>
        ) : (
          <SavedIdeas saved={saved} onOpen={setSelected} onGoSearch={() => setView("search")} />
        )}
      </main>

      <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
        Data via Scrape Creators. Videos belong to their creators; links open the original posts.
      </footer>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${profile.name}"?`}
          confirmLabel="Delete profile"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => profiles.remove(profile.id)}
        >
          <p>
            This removes the profile and its {saved.saved.length} saved idea{saved.saved.length === 1 ? "" : "s"} from this browser. It
            can't be undone.
          </p>
          {profiles.profiles.length === 1 && <p className="mt-2">You'll be asked to create a new profile next.</p>}
        </ConfirmDialog>
      )}

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
