import type { Video } from "../../shared/types.ts";
import type { SavedVideos } from "../hooks/useSavedVideos.ts";
import { useDensity } from "../hooks/useDensity.ts";
import type { Density } from "../lib/profiles.ts";
import { videoKey } from "../lib/storage.ts";
import { VideoCard, VideoCardSkeleton } from "./VideoCard.tsx";

/** Compact density adds one column at every breakpoint. */
const GRID: Record<Density, string> = {
  comfortable: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  compact: "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5",
};

interface VideoGridProps {
  videos: readonly Video[];
  saved: Pick<SavedVideos, "isSaved" | "toggle">;
  onOpen: (v: Video) => void;
}

export function VideoGrid({ videos, saved, onOpen }: VideoGridProps) {
  const density = useDensity();
  return (
    <ul className={GRID[density]} data-density={density}>
      {videos.map((v, i) => (
        <li key={videoKey(v)} className="flex">
          <div className="w-full">
            <VideoCard video={v} saved={saved.isSaved(v)} onToggleSave={saved.toggle} onOpen={onOpen} eager={i < 4} compact={density === "compact"} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  const density = useDensity();
  return (
    <div className={GRID[density]}>
      {Array.from({ length: count }, (_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
