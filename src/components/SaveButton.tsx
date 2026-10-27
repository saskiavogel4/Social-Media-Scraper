import { BookmarkIcon } from "./icons.tsx";

interface SaveButtonProps {
  saved: boolean;
  onClick: () => void;
  variant?: "overlay" | "full";
}

export function SaveButton({ saved, onClick, variant = "full" }: SaveButtonProps) {
  const label = saved ? "Saved" : "Save idea";
  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={saved ? "Remove from saved ideas" : "Save idea"}
        title={saved ? "Remove from saved ideas" : "Save idea"}
        className={`grid h-10 w-10 place-items-center rounded-full shadow-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
          saved ? "bg-accent-700 text-white hover:bg-accent-800" : "bg-white/95 text-slate-800 hover:bg-white"
        }`}
      >
        <BookmarkIcon filled={saved} width={18} height={18} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 ${
        saved
          ? "border-accent-700 bg-accent-700 text-white hover:bg-accent-800"
          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      }`}
    >
      <BookmarkIcon filled={saved} width={18} height={18} />
      {label}
      {saved && <span className="sr-only"> (click to remove from saved ideas)</span>}
    </button>
  );
}
