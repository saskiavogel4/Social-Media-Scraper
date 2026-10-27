import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  PASSWORD_HINT,
  authError,
  describeAuthError,
  validateCredentials,
  type AuthErrorKind,
  type AuthMode,
  type FriendlyAuthError,
} from "../lib/authErrors.ts";
import { supabase } from "../lib/supabase.ts";
import { CheckInbox } from "./CheckInbox.tsx";
import { Logo } from "./Logo.tsx";
import { Notice } from "./Notice.tsx";
import { PasswordField } from "./PasswordField.tsx";
import { ResendButton } from "./ResendButton.tsx";
import { Spinner, focusRing, inputClass, primaryButtonClass } from "./ui.tsx";

interface AuthScreenProps {
  /** Why the user is here again, e.g. after their session ended. */
  notice?: { title: string; detail: string } | null;
}

const MODES: { mode: AuthMode; label: string }[] = [
  { mode: "sign-in", label: "Sign in" },
  { mode: "sign-up", label: "Create account" },
];

const EMAIL_ERRORS: readonly AuthErrorKind[] = ["missing_email", "invalid_email", "user_exists"];
const PASSWORD_ERRORS: readonly AuthErrorKind[] = ["missing_password", "weak_password", "invalid_credentials"];

/** Email + password sign-in and sign-up. On success, App switches screens via onAuthStateChange. */
export function AuthScreen({ notice }: AuthScreenProps) {
  const ids = { tabs: useId(), panel: useId(), email: useId(), password: useId(), hint: useId(), error: useId() };
  const tabRefs = useRef<Record<AuthMode, HTMLButtonElement | null>>({ "sign-in": null, "sign-up": null });
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyAuthError | null>(null);
  /** Set after sign-up when the address still needs confirming. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const switchMode = (next: AuthMode, focusTab = false) => {
    setMode(next);
    setError(null);
    if (focusTab) tabRefs.current[next]?.focus();
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? "sign-in" : e.key === "End" ? "sign-up" : mode === "sign-in" ? "sign-up" : "sign-in";
    switchMode(next, true);
  };

  const fail = (err: FriendlyAuthError) => {
    setError(err);
    if (EMAIL_ERRORS.includes(err.kind) && err.kind !== "user_exists") emailRef.current?.focus();
    else if (PASSWORD_ERRORS.includes(err.kind) || err.kind === "user_exists") passwordRef.current?.focus();
  };

  const signIn = async (address: string) => {
    const { error: err } = await supabase.auth.signInWithPassword({ email: address, password });
    if (!err) return; // App takes over on SIGNED_IN
    const friendly = describeAuthError(err);
    if (friendly.kind === "invalid_credentials") setPassword("");
    fail(friendly);
  };

  const signUp = async (address: string) => {
    const { data, error: err } = await supabase.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    // With "Confirm email" on, Supabase hides existing accounts behind a user with no identities.
    const exists = !err && !data.session && data.user?.identities?.length === 0;
    if (err || exists) {
      const friendly = exists ? authError("user_exists") : describeAuthError(err);
      if (friendly.kind === "user_exists") {
        setMode("sign-in");
        setPassword("");
      }
      fail(friendly);
      return;
    }
    if (!data.session) setSentTo(address); // otherwise App takes over on SIGNED_IN
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateCredentials(email, password, mode);
    if (invalid) {
      fail(invalid);
      return;
    }
    const address = email.trim();
    setBusy(true);
    setError(null);
    try {
      await (mode === "sign-in" ? signIn(address) : signUp(address));
    } catch (err) {
      fail(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const emailInvalid = !!error && EMAIL_ERRORS.includes(error.kind) && error.kind !== "user_exists";
  const passwordInvalid = !!error && PASSWORD_ERRORS.includes(error.kind);
  const signingUp = mode === "sign-up";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">NextSocialPost</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Find trending TikToks, Reels and Shorts that fit your niche.</p>
        </div>

        {sentTo ? (
          <CheckInbox
            email={sentTo}
            onBack={() => {
              setSentTo(null);
              setPassword("");
              switchMode("sign-in");
            }}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {MODES.map(({ mode: m, label }) => {
                const selected = m === mode;
                return (
                  <button
                    key={m}
                    ref={(el) => {
                      tabRefs.current[m] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`${ids.tabs}-${m}`}
                    aria-selected={selected}
                    aria-controls={ids.panel}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => switchMode(m)}
                    onKeyDown={onTabKey}
                    className={`min-h-10 rounded-lg px-2 py-2 text-sm font-medium transition ${focusRing} ${
                      selected
                        ? "bg-white text-accent-800 shadow-sm dark:bg-slate-950 dark:text-accent-300"
                        : "text-slate-700 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <form
              id={ids.panel}
              role="tabpanel"
              aria-labelledby={`${ids.tabs}-${mode}`}
              onSubmit={submit}
              noValidate
              className="space-y-4"
            >
              {notice && !error && (
                <Notice tone="info" title={notice.title}>
                  {notice.detail}
                </Notice>
              )}
              <div>
                <label htmlFor={ids.email} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Email
                </label>
                <input
                  ref={emailRef}
                  id={ids.email}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? ids.error : undefined}
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              <div>
                <label htmlFor={ids.password} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Password
                </label>
                <PasswordField
                  ref={passwordRef}
                  id={ids.password}
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={passwordInvalid || undefined}
                  aria-describedby={[signingUp ? ids.hint : "", passwordInvalid ? ids.error : ""].filter(Boolean).join(" ") || undefined}
                  className="mt-1.5"
                />
                {signingUp && (
                  <p id={ids.hint} className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                    {PASSWORD_HINT}
                  </p>
                )}
              </div>

              <div id={ids.error} className="empty:hidden">
                {error && (
                  <Notice
                    tone={error.kind === "user_exists" ? "info" : "error"}
                    action={error.kind === "email_not_confirmed" ? <ResendButton email={email} /> : undefined}
                  >
                    {error.message}
                  </Notice>
                )}
              </div>

              <button type="submit" disabled={busy} className={`${primaryButtonClass} w-full`}>
                {busy && <Spinner />}
                {busy ? (signingUp ? "Creating account…" : "Signing in…") : signingUp ? "Create account" : "Sign in"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
