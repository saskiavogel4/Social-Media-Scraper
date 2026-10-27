import { useState } from "react";
import type { Video } from "../../shared/types.ts";
import { PLATFORM_LABELS } from "../lib/format.ts";
import { PlayIcon } from "./icons.tsx";

const FALLBACK_BG: Record<Video["platform"], string> = {
  tiktok: "from-slate-700 via-slate-800 to-slate-950",
  instagram: "from-fuchsia-500 via-pink-600 to-orange-500",
  youtube: "from-red-500 via-red-700 to-red-900",
};

export function thumbnailAlt(video: Video): string {
  const caption = video.caption.trim();
  const short = caption.length > 100 ? `${caption.slice(0, 97)}…` : caption;
  return short
    ? `${PLATFORM_LABELS[video.platform]} video by @${video.author.handle}: ${short}`
    : `${PLATFORM_LABELS[video.platform]} video by @${video.author.handle}`;
}

interface ThumbnailProps {
  video: Video;
  eager?: boolean;
  className?: string;
  /** Tailwind aspect classes; 9:16 by default. */
  aspect?: string;
}

/** 9:16 thumbnail. CDN thumbnails often expire or block hotlinking, so fall back to a branded placeholder. */
export function Thumbnail({ video, eager, className = "", aspect = "aspect-[9/16]" }: ThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = !video.thumbnailUrl || failedUrl === video.thumbnailUrl;

  return (
    <div className={`relative ${aspect} w-full overflow-hidden bg-slate-200 dark:bg-slate-800 ${className}`}>
      {failed ? (
        <div
          role="img"
          aria-label={thumbnailAlt(video)}
          className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br p-4 text-center text-white ${FALLBACK_BG[video.platform]}`}
        >
          <span className="rounded-full bg-white/20 p-3">
            <PlayIcon width={28} height={28} />
          </span>
          <span className="text-xs font-medium opacity-90">Preview unavailable</span>
        </div>
      ) : (
        <img
          src={video.thumbnailUrl}
          alt={thumbnailAlt(video)}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(video.thumbnailUrl)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
