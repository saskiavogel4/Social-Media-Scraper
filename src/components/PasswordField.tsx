import { useState, type InputHTMLAttributes, type Ref } from "react";
import { focusRing, inputClass } from "./ui.tsx";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  autoComplete: "current-password" | "new-password";
  ref?: Ref<HTMLInputElement>;
};

/** Password input with a Show/Hide toggle. */
export function PasswordField({ className = "", ref, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <input ref={ref} {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-20`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className={`absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-semibold text-accent-800 hover:bg-slate-100 dark:text-accent-300 dark:hover:bg-slate-800 ${focusRing}`}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
