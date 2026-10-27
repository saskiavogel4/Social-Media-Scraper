import { useState } from "react";
import { describeAuthError } from "../lib/authErrors.ts";
import { supabase } from "../lib/supabase.ts";

export type ResendState = { status: "idle" | "sending" | "sent" } | { status: "error"; message: string };

/** Sends the sign-up confirmation email again. Only ever runs when the user asks. */
export function useResendConfirmation(email: string) {
  const [state, setState] = useState<ResendState>({ status: "idle" });

  const resend = async () => {
    setState({ status: "sending" });
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      setState(error ? { status: "error", message: describeAuthError(error).message } : { status: "sent" });
    } catch (err) {
      setState({ status: "error", message: describeAuthError(err).message });
    }
  };

  return { state, resend };
}
