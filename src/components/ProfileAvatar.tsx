import type { Profile } from "../lib/profiles.ts";

/** Decorative emoji avatar; the profile name is always shown or announced next to it. */
export function ProfileAvatar({ profile, size = "md" }: { profile: Pick<Profile, "avatar">; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-accent-100 dark:bg-accent-900/60 ${size === "lg" ? "h-12 w-12 text-2xl" : "h-8 w-8 text-lg"}`}
    >
      {profile.avatar}
    </span>
  );
}
