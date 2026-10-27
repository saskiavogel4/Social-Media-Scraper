import { useId, useRef, useState } from "react";
import type { ProfileNicheResponse } from "../../shared/api.ts";
import { MAX_TERMS } from "../../shared/api.ts";
import type { Platform } from "../../shared/types.ts";
import { api, ApiError, friendlyError } from "../api.ts";
import { formatCompact, PLATFORM_LABELS } from "../lib/format.ts";
import { Notice } from "./Notice.tsx";
import { TermChips } from "./TermChips.tsx";
import { Spinner, inputClass, secondaryButtonClass } from "./ui.tsx";

type ProfileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: ProfileNicheResponse }
  | { status: "error"; error: unknown };

interface ProfilePanelProps {
  platform: Platform;
  handle: string;
  onHandleChange: (h: string) => void;
  terms: string[];
  onTermsChange: (t: string[]) => void;
}

export function ProfilePanel({ platform, handle, onHandleChange, terms, onTermsChange }: ProfilePanelProps) {
  const handleId = useId();
  const [state, setState] = useState<ProfileState>({ status: "idle" });
  const [draft, setDraft] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const cleanHandle = handle.trim().replace(/^@+/, "");

  const analyse = async () => {
    if (!cleanHandle) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });
    try {
      const data = await api.profileNiche(platform, cleanHandle, controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: "success", data });
      onTermsChange(data.terms.slice(0, MAX_TERMS));
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setState({ status: "error", error });
    }
  };

  const err = state.status === "error" ? friendlyError(state.error, "profile") : null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={handleId} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          Your {PLATFORM_LABELS[platform]} handle
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 dark:text-slate-400" aria-hidden="true">
              @
            </span>
            <input
              id={handleId}
              type="text"
              value={handle}
              onChange={(e) => onHandleChange(e.target.value.replace(/^\s*@+/, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void analyse();
                }
              }}
              placeholder="yourhandle"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={`${inputClass} pl-7`}
            />
          </div>
          <button
            type="button"
            onClick={() => void analyse()}
            disabled={!cleanHandle || state.status === "loading"}
            className={secondaryButtonClass}
          >
            {state.status === "loading" ? (
              <>
                <Spinner /> Analysing…
              </>
            ) : (
              "Analyse account"
            )}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
          We'll read your recent public posts and suggest niche terms you can edit.
        </p>
      </div>

      <div aria-live="polite">
        {err && (
          <Notice tone="error" title={err.title}>
            {err.detail}
            {state.status === "error" && state.error instanceof ApiError && state.error.code === "not_found" && (
              <> Make sure the account is on {PLATFORM_LABELS[platform]}.</>
            )}
          </Notice>
        )}
        {state.status === "success" && (
          <p className="mb-3 text-sm break-words text-slate-700 dark:text-slate-300">
            <span className="font-semibold">@{state.data.handle}</span>
            {state.data.followers !== undefined && <> · {formatCompact(state.data.followers)} followers</>}
            {" · "}based on {state.data.sampleSize} recent post{state.data.sampleSize === 1 ? "" : "s"}
            {state.data.terms.length === 0 && <> · no clear niche terms found, add your own below</>}
          </p>
        )}
      </div>

      {(state.status === "success" || terms.length > 0) && (
        <TermChips
          label="Suggested niche terms"
          hint="Edit these before searching. Press Enter or comma to add."
          terms={terms}
          onChange={onTermsChange}
          draft={draft}
          onDraftChange={setDraft}
          max={MAX_TERMS}
          placeholder="Add a term…"
        />
      )}
    </div>
  );
}
