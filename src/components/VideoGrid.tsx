import type { Video } from "../../shared/types.ts";
import type { SavedVideos } from "../hooks/useSavedVideos.ts";
import { videoKey } from "../lib/storage.ts";
import { VideoCard, VideoCardSkeleton } from "./VideoCard.tsx";

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

interface VideoGridProps {
  videos: readonly Video[];
  saved: Pick<SavedVideos, "isSaved" | "toggle">;
  onOpen: (v: Video) => void;
}

export function VideoGrid({ videos, saved, onOpen }: VideoGridProps) {
  return (
    <ul className={GRID}>
      {videos.map((v, i) => (
        <li key={videoKey(v)} className="flex">
          <div className="w-full">
            <VideoCard video={v} saved={saved.isSaved(v)} onToggleSave={saved.toggle} onOpen={onOpen} eager={i < 4} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
