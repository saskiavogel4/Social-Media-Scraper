import { useId, useRef, type ReactNode } from "react";
import { useDialog } from "../hooks/useDialog.ts";
import { focusRing, secondaryButtonClass } from "./ui.tsx";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small modal confirmation for destructive actions. Focus starts on Cancel; Esc cancels. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialog(ref, onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]" onClick={onCancel} aria-hidden="true" />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl focus:outline-none dark:bg-slate-900"
      >
        <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <div id={descId} className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          {children}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={secondaryButtonClass} data-autofocus>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 ${focusRing}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
