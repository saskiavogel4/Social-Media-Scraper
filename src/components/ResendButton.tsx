import { useResendConfirmation } from "../hooks/useResendConfirmation.ts";
import { Spinner, secondaryButtonClass } from "./ui.tsx";

/** "Resend email" for the sign-up confirmation link, with its result announced politely. */
export function ResendButton({ email }: { email: string }) {
  const { state, resend } = useResendConfirmation(email);
  const sending = state.status === "sending";
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void resend()} disabled={sending} className={secondaryButtonClass}>
        {sending && <Spinner />}
        {sending ? "Sending…" : "Resend email"}
      </button>
      <p role="status" className="text-sm">
        {state.status === "sent" && "Sent again. It can take a minute to arrive."}
        {state.status === "error" && state.message}
      </p>
    </div>
  );
}
