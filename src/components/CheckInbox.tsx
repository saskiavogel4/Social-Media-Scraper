import { useEffect, useId, useRef } from "react";
import { ResendButton } from "./ResendButton.tsx";
import { primaryButtonClass } from "./ui.tsx";

interface CheckInboxProps {
  email: string;
  onBack: () => void;
}

/** Shown after sign-up when Supabase wants the email address confirmed first. */
export function CheckInbox({ email, onBack }: CheckInboxProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus here so screen readers announce the next step.
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-bold tracking-tight text-slate-900 focus:outline-none dark:text-white"
      >
        Check your inbox
      </h2>
      <p className="text-slate-700 dark:text-slate-300">
        We sent a confirmation link to{" "}
        <strong className="font-semibold [overflow-wrap:anywhere] text-slate-900 dark:text-white">{email}</strong>. Click it, then
        sign in.
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-400">Didn't get it? Check spam, or wait a minute and try again.</p>
      <ResendButton email={email} />
      <button type="button" onClick={onBack} className={`${primaryButtonClass} w-full`}>
        Back to sign in
      </button>
    </section>
  );
}
