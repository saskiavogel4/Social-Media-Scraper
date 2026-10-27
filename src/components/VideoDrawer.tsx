import { useEffect, useId, useRef, useState } from "react";
import type { Video } from "../../shared/types.ts";
import { api, friendlyError } from "../api.ts";
import { useDialog } from "../hooks/useDialog.ts";
import { engagementRate, formatCompact, formatDate, formatPercent, formatRelative, PLATFORM_LABELS } from "../lib/format.ts";
import { PlatformBadge, TrendScoreBadge } from "./Badges.tsx";
import { CloseIcon, ExternalIcon, MusicIcon } from "./icons.tsx";
import { Notice } from "./Notice.tsx";
import { SaveButton } from "./SaveButton.tsx";
import { Thumbnail } from "./Thumbnail.tsx";
import { Spinner, focusRing, primaryButtonClass, secondaryButtonClass } from "./ui.tsx";

interface VideoDrawerProps {
  video: Video;
  saved: boolean;
  onToggleSave: (v: Video) => void;
  onClose: () => void;
  onHashtag: (tag: string, video: Video) => void;
}

export function VideoDrawer({ video, saved, onToggleSave, onClose, onHashtag }: VideoDrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, onClose);

  const hashtags = uniqueHashtags(video);
  const stats: { label: string; value: string }[] = [
    { label: "Views", value: formatCompact(video.stats.views) },
    { label: "Likes", value: formatCompact(video.stats.likes) },
    { label: "Comments", value: formatCompact(video.stats.comments) },
    { label: "Shares", value: formatCompact(video.stats.shares) },
    { label: "Engagement", value: formatPercent(engagementRate(video)) },
    { label: "Followers", value: formatCompact(video.author.followers) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl focus:outline-none dark:bg-slate-900"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2">
            <PlatformBadge platform={video.platform} />
            <TrendScoreBadge score={video.trendScore} />
          </div>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="Close details"
            className={`grid h-10 w-10 place-items-center rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 ${focusRing}`}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="flex gap-4">
            <div className="w-32 shrink-0 overflow-hidden rounded-xl sm:w-40">
              <Thumbnail video={video} eager />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 id={titleId} className="text-base font-semibold break-words text-slate-900 dark:text-slate-100">
                {video.author.displayName || `@${video.author.handle}`}
              </h2>
              {video.author.displayName && <p className="text-sm break-all text-slate-600 dark:text-slate-400">@{video.author.handle}</p>}
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Posted{" "}
                <time dateTime={video.postedAt}>
                  {formatDate(video.postedAt)}
                  {video.postedAt && ` (${formatRelative(video.postedAt)})`}
                </time>
              </p>
              {video.durationSec !== undefined && (
                <p className="text-sm text-slate-600 dark:text-slate-400">Length {formatDuration(video.durationSec)}</p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-100 p-2 text-center dark:bg-slate-800">
                <dt className="text-xs text-slate-600 dark:text-slate-400">{s.label}</dt>
                <dd className="text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">{s.value}</dd>
              </div>
            ))}
          </dl>

          <section aria-label="Caption">
            <p className="text-sm whitespace-pre-line break-words text-slate-800 dark:text-slate-200">
              {video.caption.trim() || <span className="italic text-slate-500 dark:text-slate-400">No caption</span>}
            </p>
          </section>

          {hashtags.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Hashtags</h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                Tap one to search it on {PLATFORM_LABELS[video.platform]}.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => onHashtag(`#${tag}`, video)}
                      className={`rounded-full bg-accent-100 px-3 py-1 text-sm font-medium text-accent-900 hover:bg-accent-200 dark:bg-accent-900/60 dark:text-accent-100 dark:hover:bg-accent-800 ${focusRing}`}
                    >
                      #{tag}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {video.soundName && (
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <MusicIcon width={16} height={16} className="shrink-0" />
              <span className="sr-only">Sound:</span>
              <span className="min-w-0 break-words">{video.soundName}</span>
            </p>
          )}

          <Transcript key={`${video.platform}:${video.id}`} video={video} />
        </div>

        <footer className="flex flex-col gap-2 border-t border-slate-200 p-4 min-[400px]:flex-row dark:border-slate-800">
          <a href={video.url} target="_blank" rel="noopener noreferrer" className={`${primaryButtonClass} flex-1`}>
            Open on {PLATFORM_LABELS[video.platform]}
            <ExternalIcon width={16} height={16} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <SaveButton saved={saved} onClick={() => onToggleSave(video)} />
        </footer>
      </div>
    </div>
  );
}

type TranscriptState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string | null }
  | { status: "error"; error: unknown };

function Transcript({ video }: { video: Video }) {
  const [state, setState] = useState<TranscriptState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const headingId = useId();

  useEffect(() => () => controllerRef.current?.abort(), []);

  const load = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });
    try {
      const res = await api.transcript(video.platform, video.url, controller.signal);
      if (!controller.signal.aborted) setState({ status: "done", text: res.transcript?.trim() || null });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: "error", error });
    }
  };

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Transcript
      </h3>
      <div aria-live="polite">
        {state.status === "idle" && (
          <div className="space-y-1">
            <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
              Load transcript
            </button>
            <p className="text-xs text-slate-600 dark:text-slate-400">Uses API credits, so it's only fetched when you ask.</p>
          </div>
        )}
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <Spinner /> Loading transcript…
          </p>
        )}
        {state.status === "done" &&
          (state.text ? (
            <div
              tabIndex={0}
              aria-label="Transcript text"
              className={`max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${focusRing}`}
            >
              {state.text}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">No transcript available for this video.</p>
          ))}
        {state.status === "error" && (
          <Notice
            tone="error"
            title={friendlyError(state.error, "transcript").title}
            action={
              <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
                Try again
              </button>
            }
          >
            {friendlyError(state.error, "transcript").detail}
          </Notice>
        )}
      </div>
    </section>
  );
}

function uniqueHashtags(video: Video): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of video.hashtags) {
    const tag = raw.replace(/^#+/, "").trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}
