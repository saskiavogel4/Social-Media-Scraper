import { useId, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  columns?: string;
  describedBy?: string;
}

/** Radio group styled as a segmented control; arrow keys work natively. */
export function Segmented<T extends string>({ legend, options, value, onChange, columns = "grid-cols-2", describedBy }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">{legend}</legend>
      <div className={`mt-1.5 grid gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 ${columns}`}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={`relative flex min-h-10 items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-medium transition select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-violet-600 ${
                o.disabled
                  ? "cursor-not-allowed text-slate-400 dark:text-slate-500"
                  : checked
                    ? "cursor-pointer bg-white text-violet-800 shadow-sm dark:bg-slate-950 dark:text-violet-300"
                    : "cursor-pointer text-slate-700 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
