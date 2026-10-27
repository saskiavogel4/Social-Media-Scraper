import type { Video } from "../../shared/types.ts";
import type { SavedVideos } from "../hooks/useSavedVideos.ts";
import { downloadCsv, videosToCsv } from "../lib/csv.ts";
import { DownloadIcon } from "./icons.tsx";
import { primaryButtonClass, secondaryButtonClass } from "./ui.tsx";
import { VideoGrid } from "./VideoGrid.tsx";

interface SavedIdeasProps {
  saved: SavedVideos;
  onOpen: (v: Video) => void;
  onGoSearch: () => void;
}

export function SavedIdeas({ saved, onOpen, onGoSearch }: SavedIdeasProps) {
  const count = saved.saved.length;

  const exportCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`nextsocialpost-saved-${date}.csv`, videosToCsv(saved.saved));
  };

  return (
    <section aria-labelledby="saved-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="saved-heading" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Saved ideas
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {count === 0 ? "Nothing saved yet." : `${count} video${count === 1 ? "" : "s"} saved in this browser.`}
          </p>
        </div>
        {count > 0 && (
          <button type="button" onClick={exportCsv} className={secondaryButtonClass}>
            <DownloadIcon width={18} height={18} />
            Export CSV
          </button>
        )}
      </div>

      {count === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <p className="mx-auto max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Tap the bookmark on any video to keep it here for when you plan your next post.
          </p>
          <button type="button" onClick={onGoSearch} className={`${primaryButtonClass} mt-4`}>
            Find videos
          </button>
        </div>
      ) : (
        <VideoGrid videos={saved.saved} saved={saved} onOpen={onOpen} />
      )}
    </section>
  );
}
