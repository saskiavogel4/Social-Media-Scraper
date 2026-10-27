import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { MAX_TERMS, type PlatformChoice, type TimeWindow } from "../../shared/api.ts";
import {
  ACCENTS,
  AVATARS,
  AVATAR_LABELS,
  MAX_NAME_LENGTH,
  appearanceOf,
  cleanHandle,
  nameError,
  type Accent,
  type Appearance,
  type Density,
  type ProfileDraft,
  type ThemePref,
} from "../lib/profiles.ts";
import { MIN_VIEW_OPTIONS, PLATFORM_CHOICES, WINDOW_OPTIONS } from "../lib/searchOptions.ts";
import { SORT_OPTIONS, type SortKey } from "../lib/sort.ts";
import { FlameIcon } from "./icons.tsx";
import { Segmented } from "./Segmented.tsx";
import { addTerms, TermChips } from "./TermChips.tsx";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui.tsx";

const ACCENT_LABELS: Record<Accent, string> = {
  violet: "Violet",
  blue: "Blue",
  emerald: "Emerald",
  rose: "Rose",
  amber: "Amber",
  slate: "Slate",
};

/** Swatch colours, spelled out so Tailwind generates them. */
const ACCENT_SWATCH: Record<Accent, string> = {
  violet: "bg-violet-600",
  blue: "bg-blue-600",
  emerald: "bg-emerald-600",
  rose: "bg-rose-600",
  amber: "bg-amber-600",
  slate: "bg-slate-600",
};

interface ProfileFormProps {
  initial: ProfileDraft;
  submitLabel: string;
  /** Edit mode opens every section; create mode keeps the optional ones folded so it takes seconds. */
  expanded?: boolean;
  onSubmit: (draft: ProfileDraft) => void;
  onCancel?: () => void;
  /** Called on every look-and-feel change so the whole app previews it live; null when the form closes. */
  onPreview: (a: Appearance | null) => void;
  /** Error from saving (e.g. storage full), shown above the buttons. */
  submitError?: string | null;
  autoFocusName?: boolean;
}

export function ProfileForm({ initial, submitLabel, expanded = false, onSubmit, onCancel, onPreview, submitError, autoFocusName }: ProfileFormProps) {
  const ids = { name: useId(), nameErr: useId(), nameHint: useId(), handle: useId(), handleErr: useId(), sort: useId(), window: useId(), minViews: useId() };
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [handleText, setHandleText] = useState(initial.handle ?? "");
  const [termDraft, setTermDraft] = useState("");
  const [errors, setErrors] = useState<{ name?: string; handle?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDetailsElement>(null);

  const patch = (p: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...p }));

  const { theme, accent, density } = draft;
  useEffect(() => {
    onPreview({ theme, accent, density });
  }, [theme, accent, density, onPreview]);
  // Leaving the form (save, cancel, switching profile) ends the preview.
  useEffect(() => () => onPreview(null), [onPreview]);

  useEffect(() => {
    if (autoFocusName) nameRef.current?.focus();
  }, [autoFocusName]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nameErr = nameError(draft.name) ?? undefined;
    const handleTrim = handleText.trim().replace(/^@+/, "");
    const handle = cleanHandle(handleTrim);
    const handleErr = handleTrim && !handle ? "Handles can only use letters, numbers, dots, underscores and hyphens." : undefined;
    setErrors({ name: nameErr, handle: handleErr });
    if (nameErr) {
      nameRef.current?.focus();
      return;
    }
    if (handleErr) {
      if (contentRef.current) contentRef.current.open = true;
      handleRef.current?.focus();
      return;
    }
    const nicheTerms = termDraft.trim() ? addTerms(draft.nicheTerms, termDraft.split(","), MAX_TERMS) : draft.nicheTerms;
    onSubmit({ ...draft, name: draft.name.replace(/\s+/g, " ").trim(), handle, nicheTerms });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Profile" className="space-y-6">
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor={ids.name} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Profile name <span className="text-slate-600 dark:text-slate-400">(required)</span>
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            type="text"
            value={draft.name}
            onChange={(e) => {
              patch({ name: e.target.value.slice(0, MAX_NAME_LENGTH) });
              if (errors.name) setErrors((er) => ({ ...er, name: undefined }));
            }}
            maxLength={MAX_NAME_LENGTH}
            required
            aria-required="true"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${ids.nameErr} ${ids.nameHint}` : ids.nameHint}
            autoComplete="nickname"
            placeholder="e.g. Sam's cooking channel"
            className={`${inputClass} mt-1.5`}
          />
          {errors.name && (
            <p id={ids.nameErr} role="alert" className="mt-1.5 text-sm font-medium text-red-700 dark:text-red-400">
              {errors.name}
            </p>
          )}
          <p id={ids.nameHint} className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            Up to {MAX_NAME_LENGTH} characters. Saved on this device only.
          </p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">Avatar</legend>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5 sm:gap-2">
            {AVATARS.map((a) => {
              const checked = draft.avatar === a;
              return (
                <label
                  key={a}
                  title={AVATAR_LABELS[a]}
                  className={`grid aspect-square cursor-pointer place-items-center rounded-xl border-2 text-2xl transition select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-600 dark:has-[:focus-visible]:outline-accent-400 ${
                    checked
                      ? "border-accent-600 bg-accent-100 dark:border-accent-400 dark:bg-accent-900/60"
                      : "border-transparent bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                  }`}
                >
                  <input type="radio" name={`${ids.name}-avatar`} value={a} checked={checked} onChange={() => patch({ avatar: a })} className="sr-only" />
                  <span aria-hidden="true">{a}</span>
                  <span className="sr-only">{AVATAR_LABELS[a]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <Section title="Your content" hint="Pre-fills every search. Optional." open={expanded} detailsRef={contentRef}>
        <Segmented<PlatformChoice>
          legend="Where you post most"
          options={PLATFORM_CHOICES}
          value={draft.primaryPlatform}
          onChange={(primaryPlatform) => patch({ primaryPlatform })}
          columns="grid-cols-2 sm:grid-cols-4"
        />
        <div>
          <label htmlFor={ids.handle} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Your handle (optional)
          </label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 dark:text-slate-400" aria-hidden="true">
              @
            </span>
            <input
              ref={handleRef}
              id={ids.handle}
              type="text"
              value={handleText}
              onChange={(e) => {
                setHandleText(e.target.value.replace(/^\s*@+/, ""));
                if (errors.handle) setErrors((er) => ({ ...er, handle: undefined }));
              }}
              aria-invalid={errors.handle ? true : undefined}
              aria-describedby={errors.handle ? ids.handleErr : undefined}
              placeholder="yourhandle"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={`${inputClass} pl-7`}
            />
          </div>
          {errors.handle && (
            <p id={ids.handleErr} role="alert" className="mt-1.5 text-sm font-medium text-red-700 dark:text-red-400">
              {errors.handle}
            </p>
          )}
        </div>
        <TermChips
          label="Niche keywords or hashtags"
          hint="Your go-to search terms. Press Enter or comma to add."
          terms={draft.nicheTerms}
          onChange={(nicheTerms) => patch({ nicheTerms })}
          draft={termDraft}
          onDraftChange={setTermDraft}
          max={MAX_TERMS}
          placeholder="e.g. meal prep, #booktok"
        />
      </Section>

      <Section title="Look and feel" hint="Changes preview instantly." open={expanded}>
        <Segmented<ThemePref>
          legend="Theme"
          options={[
            { value: "system", label: "Device" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value={draft.theme}
          onChange={(theme) => patch({ theme })}
          columns="grid-cols-3"
        />
        <fieldset>
          <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">Accent colour</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 min-[480px]:grid-cols-6">
            {ACCENTS.map((a) => {
              const checked = draft.accent === a;
              return (
                <label
                  key={a}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-sm font-medium transition select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-600 dark:has-[:focus-visible]:outline-accent-400 ${
                    checked
                      ? "border-slate-900 bg-slate-100 text-slate-900 dark:border-white dark:bg-slate-800 dark:text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <input type="radio" name={`${ids.name}-accent`} value={a} checked={checked} onChange={() => patch({ accent: a })} className="sr-only" />
                  <span aria-hidden="true" className={`h-5 w-5 shrink-0 rounded-full ${ACCENT_SWATCH[a]}`} />
                  {ACCENT_LABELS[a]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Segmented<Density>
          legend="Card size"
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
          value={draft.density}
          onChange={(density) => patch({ density })}
        />
        <AppearancePreview appearance={appearanceOf(draft)} />
      </Section>

      <Section title="Search defaults" hint="How results start out. You can still change them per search." open={expanded}>
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-3">
          <SelectField id={ids.sort} label="Sort results by" value={draft.defaultSort} onChange={(v) => patch({ defaultSort: v as SortKey })} options={SORT_OPTIONS} />
          <SelectField id={ids.window} label="Posted within" value={draft.defaultWindow} onChange={(v) => patch({ defaultWindow: v as TimeWindow })} options={WINDOW_OPTIONS} />
          <SelectField
            id={ids.minViews}
            label="Minimum views"
            value={String(draft.defaultMinViews)}
            onChange={(v) => patch({ defaultMinViews: Number(v) })}
            options={MIN_VIEW_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          />
        </div>
      </Section>

      <p className="text-xs text-slate-600 dark:text-slate-400">
        Profiles are saved on this device only, in this browser. Nothing about them is sent to a server.
      </p>

      {submitError && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {submitError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className={primaryButtonClass}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  open,
  detailsRef,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  detailsRef?: Ref<HTMLDetailsElement>;
  children: ReactNode;
}) {
  return (
    <details
      ref={detailsRef}
      open={open || undefined}
      className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 sm:px-6 dark:focus-visible:outline-accent-400 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-semibold text-slate-900 dark:text-slate-100">{title}</span>
          <span className="block text-xs text-slate-600 dark:text-slate-400">{hint}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-slate-500 transition group-open:rotate-180 dark:text-slate-400">
          ▾
        </span>
      </summary>
      <div className="space-y-5 border-t border-slate-200 p-4 sm:p-6 dark:border-slate-800">{children}</div>
    </details>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1.5`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A tiny, non-interactive sample of the accent and card size (the whole page previews the theme). */
function AppearancePreview({ appearance }: { appearance: Appearance }) {
  const compact = appearance.density === "compact";
  return (
    <div aria-hidden="true" className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <p className="mb-2 text-xs font-medium tracking-wide text-slate-600 uppercase dark:text-slate-400">Preview</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white">Find trends</span>
        <span className="rounded-full bg-accent-100 px-3 py-1 text-sm font-medium text-accent-900 dark:bg-accent-900/60 dark:text-accent-100">meal prep</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-700 px-2 py-0.5 text-xs font-bold text-white">
          <FlameIcon width={12} height={12} />
          87
        </span>
      </div>
      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-4" : "grid-cols-3"}`}>
        {Array.from({ length: compact ? 4 : 3 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <div className={`bg-slate-200 dark:bg-slate-700 ${compact ? "h-10" : "h-14"}`} />
            <div className="space-y-1 p-1.5">
              <div className="h-1.5 rounded bg-slate-300 dark:bg-slate-600" />
              <div className="h-1.5 w-2/3 rounded bg-slate-300 dark:bg-slate-600" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
