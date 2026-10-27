// Shared class names and tiny presentational helpers.

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400";

export const primaryButtonClass = `inline-flex items-center justify-center gap-2 rounded-xl bg-accent-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const secondaryButtonClass = `inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 ${focusRing}`;

export const inputClass =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-accent-600 focus:ring-2 focus:ring-accent-600/40 focus:outline-none sm:text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
