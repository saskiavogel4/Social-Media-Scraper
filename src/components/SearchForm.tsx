import { useId, useState, type FormEvent } from "react";
import { MAX_TERMS, type PlatformChoice, type TimeWindow } from "../../shared/api.ts";
import type { Profile } from "../lib/profiles.ts";
import { MIN_VIEW_OPTIONS, PLATFORM_CHOICES, WINDOW_OPTIONS } from "../lib/searchOptions.ts";
import { ProfilePanel } from "./ProfilePanel.tsx";
import { Segmented, type SegmentedOption } from "./Segmented.tsx";
import { addTerms, TermChips } from "./TermChips.tsx";
import { SearchIcon, TrendingIcon } from "./icons.tsx";
import { Spinner, inputClass, primaryButtonClass, secondaryButtonClass } from "./ui.tsx";

export type SearchMode = "niche" | "profile";

export interface FormState {
  platform: PlatformChoice;
  mode: SearchMode;
  terms: string[];
  handle: string;
  profileTerms: string[];
  window: TimeWindow;
  minViews: number;
}

export const INITIAL_FORM: FormState = {
  platform: "tiktok",
  mode: "niche",
  terms: [],
  handle: "",
  profileTerms: [],
  window: "7d",
  minViews: 0,
};

/** The search form as a profile wants it to start: platform, niche terms, handle and filters. */
export function formFromProfile(p: Profile): FormState {
  // With only a handle (no niche terms), start in account mode so one tap analyses it.
  const accountFirst = !!p.handle && p.nicheTerms.length === 0 && p.primaryPlatform !== "all";
  return {
    platform: p.primaryPlatform,
    mode: accountFirst ? "profile" : "niche",
    terms: [...p.nicheTerms],
    handle: p.handle ?? "",
    profileTerms: [],
    window: p.defaultWindow,
    minViews: p.defaultMinViews,
  };
}

/** After editing a profile, carry over only the search defaults that actually changed. */
export function formPatchForProfileEdit(prev: Profile, next: Profile, form: FormState): Partial<FormState> {
  const patch: Partial<FormState> = {};
  if (prev.primaryPlatform !== next.primaryPlatform) {
    patch.platform = next.primaryPlatform;
    if (next.primaryPlatform === "all" && form.mode === "profile") patch.mode = "niche";
  }
  if (prev.nicheTerms.join("\n") !== next.nicheTerms.join("\n")) patch.terms = [...next.nicheTerms];
  if (prev.handle !== next.handle) {
    patch.handle = next.handle ?? "";
    patch.profileTerms = [];
  }
  if (prev.defaultWindow !== next.defaultWindow) patch.window = next.defaultWindow;
  if (prev.defaultMinViews !== next.defaultMinViews) patch.minViews = next.defaultMinViews;
  return patch;
}

const PLATFORM_OPTIONS: SegmentedOption<PlatformChoice>[] = [...PLATFORM_CHOICES];

interface SearchFormProps {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSearch: (terms: string[]) => void;
  onTrending: () => void;
  busy: boolean;
}

export function SearchForm({ form, onChange, onSearch, onTrending, busy }: SearchFormProps) {
  const ids = { allHint: useId(), window: useId(), minViews: useId(), error: useId() };
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isProfile = form.mode === "profile";

  const setMode = (mode: SearchMode) => {
    setError(null);
    // Analysing an account needs one specific platform.
    onChange(mode === "profile" && form.platform === "all" ? { mode, platform: "tiktok" } : { mode });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let terms = isProfile ? form.profileTerms : form.terms;
    if (!isProfile && draft.trim()) {
      terms = addTerms(terms, draft.split(","), MAX_TERMS);
      onChange({ terms });
      setDraft("");
    }
    if (terms.length === 0) {
      setError(isProfile ? "Analyse your account first, or add a term." : "Add at least one keyword or hashtag.");
      return;
    }
    setError(null);
    onSearch(terms);
  };

  const platformOptions = PLATFORM_OPTIONS.map((o) => (o.value === "all" && isProfile ? { ...o, disabled: true } : o));

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Find trending videos"
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <Segmented
          legend="Platform"
          options={platformOptions}
          value={form.platform}
          onChange={(platform) => onChange({ platform })}
          columns="grid-cols-2 sm:grid-cols-4"
          describedBy={ids.allHint}
        />
        <p id={ids.allHint} className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
          {isProfile
            ? "Pick the platform your account is on."
            : form.platform === "all"
              ? "Heads up: All searches every platform and uses about 3× the credits."
              : "Choose All to search every platform (uses about 3× the credits)."}
        </p>
      </div>

      <Segmented<SearchMode>
        legend="Search by"
        options={[
          { value: "niche", label: "My niche" },
          { value: "profile", label: "My account" },
        ]}
        value={form.mode}
        onChange={setMode}
      />

      {isProfile && form.platform !== "all" ? (
        <ProfilePanel
          key={form.platform}
          platform={form.platform}
          handle={form.handle}
          onHandleChange={(handle) => onChange({ handle })}
          terms={form.profileTerms}
          onTermsChange={(profileTerms) => onChange({ profileTerms })}
        />
      ) : (
        <TermChips
          label="Keywords or hashtags"
          terms={form.terms}
          onChange={(terms) => {
            setError(null);
            onChange({ terms });
          }}
          draft={draft}
          onDraftChange={setDraft}
          max={MAX_TERMS}
          placeholder="e.g. meal prep, #booktok"
        />
      )}

      <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
        <div>
          <label htmlFor={ids.window} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Posted within
          </label>
          <select
            id={ids.window}
            value={form.window}
            onChange={(e) => onChange({ window: e.target.value as TimeWindow })}
            className={`${inputClass} mt-1.5`}
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.minViews} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Minimum views
          </label>
          <select
            id={ids.minViews}
            value={form.minViews}
            onChange={(e) => onChange({ minViews: Number(e.target.value) })}
            className={`${inputClass} mt-1.5`}
          >
            {MIN_VIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p id={ids.error} role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="submit" disabled={busy} className={primaryButtonClass} aria-describedby={error ? ids.error : undefined}>
          {busy ? <Spinner /> : <SearchIcon width={18} height={18} />}
          Find trends
        </button>
        <button type="button" onClick={onTrending} disabled={busy} className={secondaryButtonClass}>
          <TrendingIcon width={18} height={18} />
          Trending now
        </button>
        <p className="text-xs text-slate-600 sm:ml-2 dark:text-slate-400">
          "Trending now" shows what's hot on {form.platform === "all" ? "every platform" : "this platform"}, no niche needed.
        </p>
      </div>
    </form>
  );
}
