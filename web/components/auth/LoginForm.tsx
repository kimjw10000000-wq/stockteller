"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthPasswordInput,
  AuthToast,
  authInputClass,
  authPrimaryBtnClass,
} from "@/components/auth/AuthCard";
import { AUTH_HOME, mapAuthError, safeInternalPath, validateEmail } from "@/lib/auth/validation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  initialError?: string;
  next?: string;
};

export function LoginForm({ initialError = "", next }: LoginFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (!password) {
      setError("auth.passwordRequired");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(mapAuthError(signInError.message, signInError.code));
      return;
    }
    setToast("auth.loginSuccess");
    const dest = safeInternalPath(next, AUTH_HOME);
    window.setTimeout(() => {
      router.replace(dest);
      router.refresh();
    }, 700);
  }

  return (
    <>
      <AuthToast message={toast} />
      <AuthCard title={t("auth.loginTitle")} subtitle={t("auth.loginSubtitle")}>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <AuthField id="login-email" label={t("auth.email")}>
            <input
              id="login-email"
              className={authInputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </AuthField>
          <AuthField id="login-password" label={t("auth.password")}>
            <AuthPasswordInput
              id="login-password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              required
            />
          </AuthField>
          <p className="text-right text-sm">
            <Link
              href="/forgot-password"
              className="text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
            >
              {t("auth.forgot")}
            </Link>
          </p>
          <AuthError message={error} />
          <button type="submit" className={authPrimaryBtnClass} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? t("auth.loggingIn") : t("header.login")}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-zinc-400">
          {t("auth.noAccount")}{" "}
          <Link href="/signup" prefetch className="font-medium text-zinc-100 underline-offset-4 hover:underline">
            {t("auth.signup")}
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
