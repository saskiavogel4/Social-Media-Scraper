import { useCallback, useEffect, useMemo, useState } from "react";
import type { Video } from "../../shared/types.ts";
import { savedKey } from "../lib/profiles.ts";
import { loadSaved, storeSaved, videoKey } from "../lib/storage.ts";

export interface SavedVideos {
  saved: Video[];
  isSaved: (v: Video) => boolean;
  toggle: (v: Video) => void;
  remove: (v: Video) => void;
}

/** Saved ideas of one profile. Remount (key by profile id) when the profile changes. */
export function useSavedVideos(profileId: string): SavedVideos {
  const [saved, setSaved] = useState<Video[]>(() => loadSaved(profileId));

  useEffect(() => storeSaved(profileId, saved), [profileId, saved]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === savedKey(profileId)) setSaved(loadSaved(profileId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [profileId]);

  const keys = useMemo(() => new Set(saved.map(videoKey)), [saved]);
  const isSaved = useCallback((v: Video) => keys.has(videoKey(v)), [keys]);
  const remove = useCallback((v: Video) => {
    const k = videoKey(v);
    setSaved((prev) => prev.filter((x) => videoKey(x) !== k));
  }, []);
  const toggle = useCallback((v: Video) => {
    const k = videoKey(v);
    setSaved((prev) => (prev.some((x) => videoKey(x) === k) ? prev.filter((x) => videoKey(x) !== k) : [v, ...prev]));
  }, []);

  return { saved, isSaved, toggle, remove };
}
