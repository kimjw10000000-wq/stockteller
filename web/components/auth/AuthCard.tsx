"use client";

import { Eye, EyeOff } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { qwertyCharFromKeyboardEvent } from "@/lib/auth/password-keys";
import { sanitizePasswordInput } from "@/lib/auth/validation";
import { hasMessage } from "@/lib/i18n/translate";

export function AuthCard({
  title,
  subtitle,
  step,
  children,
}: {
  title: string;
  subtitle?: string;
  step?: 1 | 2 | 3;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-700/70 bg-zinc-950 p-6 text-zinc-100 shadow-2xl shadow-black/50 sm:p-8">
      {step ? (
        <div className="mb-5 flex items-center justify-center gap-2" aria-label={t("auth.stepAria", { step })}>
          {([1, 2, 3] as const).map((n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 w-8 rounded-full",
                n <= step ? "bg-zinc-100" : "bg-zinc-700"
              )}
            />
          ))}
        </div>
      ) : null}
      <h1 className="text-center text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-center text-sm text-zinc-400">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function AuthField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-zinc-200">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export const authInputClass =
  "flex h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base text-zinc-100 outline-none placeholder:text-zinc-500 focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-500/40 disabled:opacity-50";

export const authPrimaryBtnClass =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-50";

export function AuthPasswordInput({
  id,
  autoComplete,
  value,
  onChange,
  required,
  disabled,
}: {
  id: string;
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && caretRef.current != null) {
      el.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        className={cn(authInputClass, "pr-11")}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        lang="en"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        value={value}
        onChange={(e) => onChange(sanitizePasswordInput(e.target.value))}
        onKeyDown={(e) => {
          if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
          const ch = qwertyCharFromKeyboardEvent(e.nativeEvent);
          if (!ch) return;
          e.preventDefault();
          const el = inputRef.current;
          const start = el?.selectionStart ?? value.length;
          const end = el?.selectionEnd ?? value.length;
          const next = sanitizePasswordInput(value.slice(0, start) + ch + value.slice(end));
          caretRef.current = start + ch.length;
          onChange(next);
        }}
        required={required}
        disabled={disabled}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 transition-colors hover:text-white"
        onClick={() => setVisible((open) => !open)}
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
      >
        {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <p className="text-sm text-rose-400" role="alert">
      {hasMessage(message) ? t(message) : message}
    </p>
  );
}

export function AuthToast({ message }: { message: string | null }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-50 shadow-lg"
      role="status"
    >
      {hasMessage(message) ? t(message) : message}
    </div>
  );
}
