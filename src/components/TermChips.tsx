import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { sanitizeTerm } from "../../shared/api.ts";
import { CloseIcon } from "./icons.tsx";

/** Adds terms (sanitised, deduped case-insensitively) up to `max`. */
export function addTerms(existing: readonly string[], incoming: readonly string[], max: number): string[] {
  const out = [...existing];
  for (const raw of incoming) {
    const t = sanitizeTerm(raw);
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    if (out.length >= max) break;
    out.push(t);
  }
  return out;
}

interface TermChipsProps {
  label: string;
  hint?: string;
  terms: string[];
  onChange: (terms: string[]) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  max: number;
  placeholder?: string;
}

export function TermChips({ label, hint, terms, onChange, draft, onDraftChange, max, placeholder }: TermChipsProps) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const full = terms.length >= max;

  const commit = (text: string) => {
    const parts = text.split(",");
    onChange(addTerms(terms, parts, max));
    onDraftChange("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      } else if (e.key === ",") {
        e.preventDefault();
      }
      // Enter on an empty input falls through and submits the form.
    } else if (e.key === "Backspace" && draft === "" && terms.length > 0) {
      e.preventDefault();
      onChange(terms.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(",")) {
      e.preventDefault();
      commit(draft + text);
    }
  };

  const remove = (i: number) => {
    onChange(terms.filter((_, j) => j !== i));
    inputRef.current?.focus();
  };

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        {label}
      </label>
      <div
        className="mt-1.5 flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2 py-1.5 focus-within:border-accent-600 focus-within:ring-2 focus-within:ring-accent-600/40 dark:border-slate-600 dark:bg-slate-900"
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
      >
        <ul className="contents" aria-label="Selected terms">
          {terms.map((t, i) => (
            <li key={t} className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-100 py-1 pr-1 pl-3 text-sm font-medium text-accent-900 dark:bg-accent-900/60 dark:text-accent-100">
              <span className="truncate">{t}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${t}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-accent-200 focus-visible:outline-2 focus-visible:outline-accent-700 dark:hover:bg-accent-800"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={full ? `Maximum ${max} terms` : terms.length ? "Add another…" : placeholder}
          aria-describedby={hintId}
          enterKeyHint="enter"
          autoComplete="off"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1.5 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none sm:text-sm dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </div>
      <p id={hintId} className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
        {hint ?? "Press Enter or comma to add. Start with # for a hashtag."} {terms.length}/{max} terms.
      </p>
    </div>
  );
}
