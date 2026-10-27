import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PlatformError } from "../../shared/api.ts";
import type { Video } from "../../shared/types.ts";
import { friendlyError } from "../api.ts";
import type { SavedVideos } from "../hooks/useSavedVideos.ts";
import type { SearchQuery, SearchState } from "../hooks/useVideoSearch.ts";
import { PLATFORM_LABELS } from "../lib/format.ts";
import { SORT_OPTIONS, sortVideos, type SortKey } from "../lib/sort.ts";
import { Notice } from "./Notice.tsx";
import { inputClass, secondaryButtonClass } from "./ui.tsx";
import { VideoGrid, VideoGridSkeleton } from "./VideoGrid.tsx";

interface ResultsViewProps {
  state: SearchState;
  saved: SavedVideos;
  onOpen: (v: Video) => void;
  onRetry: (q: SearchQuery) => void;
}

export function describeQuery(q: SearchQuery): string {
  const where = q.platform === "all" ? "all platforms" : PLATFORM_LABELS[q.platform];
  return q.kind === "trending" ? `Trending now on ${where}` : `${q.terms.join(", ")} on ${where}`;
}

export function ResultsView({ state, saved, onOpen, onRetry }: ResultsViewProps) {
  const sortId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [sort, setSort] = useState<SortKey>("trend");
  const [dismissed, setDismissed] = useState<PlatformError[] | null>(null);

  const data = state.status === "success" ? state.data : null;
  const sorted = useMemo(() => (data ? sortVideos(data.videos, sort) : []), [data, sort]);

  // Move focus to the results heading when a search finishes, so screen-reader users hear the outcome.
  useEffect(() => {
    if (state.status === "success" || state.status === "error") headingRef.current?.focus();
  }, [state.status]);

  if (state.status === "idle") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ready when you are</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
          Add a few words that describe your content (like <em>meal prep</em> or <em>#booktok</em>) and press{" "}
          <strong>Find trends</strong>. Or tap <strong>Trending now</strong> to see what's hot.
        </p>
      </div>
    );
  }

  const heading = describeQuery(state.query);

  if (state.status === "loading") {
    return (
      <section aria-labelledby={`${sortId}-h`} aria-busy="true">
        <h2 id={`${sortId}-h`} className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Searching {heading}…
        </h2>
        <p className="sr-only" role="status">
          Loading results
        </p>
        <VideoGridSkeleton />
      </section>
    );
  }

  if (state.status === "error") {
    const err = friendlyError(state.error);
    return (
      <section aria-labelledby={`${sortId}-h`}>
        <h2 id={`${sortId}-h`} ref={headingRef} tabIndex={-1} className="sr-only">
          Search failed
        </h2>
        <Notice
          tone="error"
          title={err.title}
          action={
            <button type="button" className={secondaryButtonClass} onClick={() => onRetry(state.query)}>
              Try again
            </button>
          }
        >
          {err.detail}
        </Notice>
      </section>
    );
  }

  const errors = state.data.errors.filter((e) => !dismissed?.includes(e));
  const count = state.data.videos.length;

  return (
    <section aria-labelledby={`${sortId}-h`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2
            id={`${sortId}-h`}
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold break-words text-slate-900 focus:outline-none dark:text-slate-100"
          >
            {heading}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {count} video{count === 1 ? "" : "s"} found
          </p>
        </div>
        {count > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor={sortId} className="shrink-0 text-sm font-medium text-slate-800 dark:text-slate-200">
              Sort by
            </label>
            <select id={sortId} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`${inputClass} sm:w-48`}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="mb-4">
          <Notice
            tone="warning"
            title={count > 0 ? "Some platforms couldn't be searched" : "No platform could be searched"}
            onDismiss={() => setDismissed(state.data.errors)}
          >
            <ul className="list-disc space-y-0.5 pl-5">
              {errors.map((e) => (
                <li key={e.platform}>
                  <strong>{PLATFORM_LABELS[e.platform]}:</strong> {platformErrorText(e)}
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      {count === 0 ? (
        <EmptyResults trending={state.query.kind === "trending"} filtered={state.query.minViews > 0 || state.query.window !== "any"} />
      ) : (
        <VideoGrid videos={sorted} saved={saved} onOpen={onOpen} />
      )}
    </section>
  );
}

function platformErrorText(e: PlatformError): string {
  switch (e.code) {
    case "out_of_credits":
      return "out of API credits.";
    case "rate_limited":
      return "too many requests, try again in a minute.";
    case "not_found":
      return "nothing found.";
    default:
      return "the platform didn't respond. Try again shortly.";
  }
}

function EmptyResults({ trending, filtered }: { trending: boolean; filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No videos matched</h3>
      <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-sm text-slate-600 sm:text-center dark:text-slate-400">
        {filtered && <li>Widen the time window or lower the minimum views.</li>}
        {!trending && <li>Try broader terms, or a hashtag version (e.g. #mealprep).</li>}
        <li>Try a different platform, or All.</li>
      </ul>
    </div>
  );
}
