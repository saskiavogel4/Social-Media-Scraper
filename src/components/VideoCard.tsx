import type { Video } from "../../shared/types.ts";
import { formatRelative } from "../lib/format.ts";
import { PlatformBadge, TrendScoreBadge } from "./Badges.tsx";
import { SaveButton } from "./SaveButton.tsx";
import { CompactStats } from "./Stats.tsx";
import { Thumbnail } from "./Thumbnail.tsx";

interface VideoCardProps {
  video: Video;
  saved: boolean;
  onToggleSave: (v: Video) => void;
  onOpen: (v: Video) => void;
  eager?: boolean;
  /** Smaller text and padding for the compact grid. */
  compact?: boolean;
}

export function VideoCard({ video, saved, onToggleSave, onOpen, eager, compact = false }: VideoCardProps) {
  const age = formatRelative(video.postedAt);
  const caption = video.caption.trim() || "(No caption)";
  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-accent-600 has-[button:focus-visible]:ring-offset-2 dark:has-[button:focus-visible]:ring-accent-400 dark:border-slate-800 dark:bg-slate-900 dark:ring-offset-slate-950">
      <div className="relative">
        {/* Single-column phones: a 4:5 crop keeps more than one video per screen; true 9:16 from sm up. */}
        <Thumbnail video={video} eager={eager} aspect={compact ? "aspect-[9/16]" : "aspect-[4/5] sm:aspect-[9/16]"} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <PlatformBadge platform={video.platform} />
          <TrendScoreBadge score={video.trendScore} />
        </div>
        <div className="absolute right-2 bottom-2 z-10">
          <SaveButton saved={saved} onClick={() => onToggleSave(video)} variant="overlay" />
        </div>
      </div>

      <div className={`flex flex-1 flex-col ${compact ? "gap-1.5 p-2" : "gap-2 p-3"}`}>
        <h3 className={`${compact ? "text-xs" : "text-sm"} leading-snug font-medium text-slate-900 dark:text-slate-100`}>
          {/* Stretched button: the whole card opens the details drawer. */}
          <button
            type="button"
            onClick={() => onOpen(video)}
            className="line-clamp-2 cursor-pointer text-left break-words after:absolute after:inset-0 after:content-[''] focus:outline-none"
          >
            {caption}
          </button>
        </h3>
        <p className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="truncate font-medium">@{video.author.handle}</span>
          {age && (
            <time dateTime={video.postedAt} className="shrink-0">
              {age}
            </time>
          )}
        </p>
        <div className="mt-auto pt-1">
          <CompactStats stats={video.stats} compact={compact} />
        </div>
      </div>
    </article>
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-hidden="true">
      <div className="aspect-[4/5] w-full bg-slate-200 sm:aspect-[9/16] dark:bg-slate-800" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
