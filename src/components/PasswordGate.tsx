import { useId, useState, type FormEvent } from "react";
import { api, ApiError, friendlyError } from "../api.ts";
import { Notice } from "./Notice.tsx";
import { Logo } from "./Logo.tsx";
import { Spinner, inputClass, primaryButtonClass } from "./ui.tsx";

interface PasswordGateProps {
  onSuccess: (password: string) => void;
  expired?: boolean;
}

export function PasswordGate({ onSuccess, expired }: PasswordGateProps) {
  const inputId = useId();
  const errorId = useId();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError({ title: "Enter the access password", detail: "Ask the site owner if you don't have it." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.session(password);
      onSuccess(password);
    } catch (err) {
      setError(friendlyError(err, "session"));
      if (err instanceof ApiError && err.code === "unauthorized") setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Trend Scout</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Find trending TikToks, Reels and Shorts that fit your niche.</p>
        </div>
        <form
          onSubmit={submit}
          noValidate
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {expired && !error && (
            <Notice tone="info">Your session ended. Please enter the access password again.</Notice>
          )}
          <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Access password
            </label>
            <input
              id={inputId}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`${inputClass} mt-1.5`}
            />
          </div>
          {error && (
            <div id={errorId}>
              <Notice tone="error" title={error.title}>
                {error.detail}
              </Notice>
            </div>
          )}
          <button type="submit" disabled={busy} className={`${primaryButtonClass} w-full`}>
            {busy && <Spinner />}
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
