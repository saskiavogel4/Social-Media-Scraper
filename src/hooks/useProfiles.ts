import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVE_PROFILE_KEY,
  PROFILES_KEY,
  activeProfile,
  createProfile,
  deleteProfile,
  loadProfiles,
  switchProfile,
  updateProfile,
  type Profile,
  type ProfileDraft,
  type ProfileStore,
} from "../lib/profiles.ts";

export interface Profiles {
  profiles: Profile[];
  active: Profile | null;
  /** Creates a profile and makes it active. Throws ProfileError on an invalid name. */
  create: (draft: ProfileDraft) => Profile;
  update: (id: string, draft: Partial<ProfileDraft>) => void;
  remove: (id: string) => void;
  switchTo: (id: string) => void;
}

export function useProfiles(): Profiles {
  const [store, setStore] = useState<ProfileStore>(() => loadProfiles());
  // Operations work on the latest store even if storage is unavailable (then profiles last for this session).
  const storeRef = useRef(store);
  const commit = useCallback((next: ProfileStore) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  // Keep several tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PROFILES_KEY || e.key === ACTIVE_PROFILE_KEY) commit(loadProfiles());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [commit]);

  const create = useCallback(
    (draft: ProfileDraft) => {
      const { store: next, profile } = createProfile(storeRef.current, draft);
      commit(next);
      return profile;
    },
    [commit],
  );
  const update = useCallback((id: string, draft: Partial<ProfileDraft>) => commit(updateProfile(storeRef.current, id, draft)), [commit]);
  const remove = useCallback((id: string) => commit(deleteProfile(storeRef.current, id)), [commit]);
  const switchTo = useCallback((id: string) => commit(switchProfile(storeRef.current, id)), [commit]);

  return { profiles: store.profiles, active: activeProfile(store), create, update, remove, switchTo };
}
