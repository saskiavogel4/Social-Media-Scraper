import { useState } from "react";
import { DEFAULT_DRAFT, ProfileError, type Appearance, type ProfileDraft } from "../lib/profiles.ts";
import { Logo } from "./Logo.tsx";
import { ProfileForm } from "./ProfileForm.tsx";

interface ProfileSetupProps {
  onCreate: (draft: ProfileDraft) => void;
  onPreview: (a: Appearance | null) => void;
  onSignOut: () => void;
}

/** First run (or after deleting the last profile): only the name is required. */
export function ProfileSetup({ onCreate, onPreview, onSignOut }: ProfileSetupProps) {
  const [error, setError] = useState<string | null>(null);

  const submit = (draft: ProfileDraft) => {
    try {
      onCreate(draft);
    } catch (err) {
      setError(err instanceof ProfileError ? err.message : "Couldn't save your profile. Please try again.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 text-center">
        <Logo className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">Create your profile</h1>
        <p className="mx-auto mt-2 max-w-md text-slate-600 dark:text-slate-400">
          Pick a name and an avatar and you're ready. Add your platform, niche and favourite look now or any time later.
        </p>
      </div>
      <ProfileForm initial={DEFAULT_DRAFT} submitLabel="Create profile" onSubmit={submit} onPreview={onPreview} submitError={error} autoFocusName />
      <p className="mt-8 text-center">
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg px-2 py-2 text-sm font-medium text-slate-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-slate-400 dark:focus-visible:outline-accent-400"
        >
          Sign out
        </button>
      </p>
    </main>
  );
}
