import type { ReactNode } from "react";
import { CloseIcon } from "./icons.tsx";

type Tone = "info" | "warning" | "error";

const TONES: Record<Tone, string> = {
  info: "border-accent-200 bg-accent-50 text-accent-900 dark:border-accent-800 dark:bg-accent-950/60 dark:text-accent-100",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100",
  error: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100",
};

interface NoticeProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  action?: ReactNode;
}

export function Notice({ tone = "info", title, children, onDismiss, action }: NoticeProps) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${TONES[tone]}`}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded-md p-1 opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          aria-label="Dismiss notice"
        >
          <CloseIcon width={18} height={18} />
        </button>
      )}
    </div>
  );
}
