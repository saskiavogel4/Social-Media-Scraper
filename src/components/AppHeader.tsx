import type { ReactNode } from "react";
import { Logo } from "./Logo.tsx";
import { focusRing } from "./ui.tsx";

export type View = "search" | "saved";

interface AppHeaderProps {
  /** null while a non-tab screen (e.g. profile settings) is shown. */
  view: View | null;
  onViewChange: (v: View) => void;
  savedCount: number;
  onSignOut: () => void;
  /** The profile menu, shown between the tabs and Sign out. */
  profileMenu?: ReactNode;
}

export function AppHeader({ view, onViewChange, savedCount, onSignOut, profileMenu }: AppHeaderProps) {
  const tab = (v: View, label: string, badge?: number) => {
    const active = view === v;
    return (
      <button
        type="button"
        onClick={() => onViewChange(v)}
        aria-current={active ? "page" : undefined}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${focusRing} ${
          active
            ? "bg-accent-100 text-accent-900 dark:bg-accent-900/60 dark:text-accent-100"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
      >
        {label}
        {badge !== undefined && (
          <span
            className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${
              active ? "bg-accent-700 text-white" : "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6">
        <button
          type="button"
          onClick={() => onViewChange("search")}
          className={`flex shrink-0 items-center gap-2 rounded-lg ${focusRing}`}
          aria-label="NextSociaPost home"
        >
          <Logo className="h-8 w-8" />
          <span className="hidden text-lg font-bold tracking-tight text-slate-900 min-[480px]:inline dark:text-white">NextSociaPost</span>
        </button>
        <nav aria-label="Main" className="flex items-center gap-1">
          {tab("search", "Search")}
          {tab("saved", "Saved", savedCount)}
          {profileMenu}
          <button
            type="button"
            onClick={onSignOut}
            className={`rounded-lg px-2 py-2 text-sm font-medium text-slate-600 underline-offset-4 hover:underline dark:text-slate-400 ${focusRing}`}
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
