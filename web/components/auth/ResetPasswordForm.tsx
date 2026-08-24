"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthPasswordInput,
  AuthToast,
  authPrimaryBtnClass,
} from "@/components/auth/AuthCard";
import { AUTH_HOME, mapAuthError, validatePassword } from "@/lib/auth/validation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let settled = false;

    const markReady = () => {
      settled = true;
      setReady(true);
      setError("");
    };

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) markReady();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user || event === "PASSWORD_RECOVERY") {
        markReady();
      }
    });

    const timer = window.setTimeout(() => {
      if (!settled) {
        setError("재설정 링크가 만료되었거나 올바르지 않습니다. 비밀번호 찾기를 다시 진행해 주세요.");
      }
    }, 2500);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(mapAuthError(updateError.message, updateError.code));
      return;
    }
    setToast("비밀번호가 변경되었습니다.");
    window.setTimeout(() => {
      router.replace(AUTH_HOME);
      router.refresh();
    }, 900);
  }

  return (
    <>
      <AuthToast message={toast} />
      <AuthCard title={t("auth.newPasswordTitle")} subtitle={t("auth.newPasswordSubtitle")}>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <AuthField id="new-password" label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
            <AuthPasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              required
              disabled={!ready}
            />
          </AuthField>
          <AuthField id="new-password-confirm" label={t("auth.newPasswordConfirm")}>
            <AuthPasswordInput
              id="new-password-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
              required
              disabled={!ready}
            />
          </AuthField>
          <AuthError message={error} />
          <button type="submit" className={authPrimaryBtnClass} disabled={loading || !ready}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "변경 중…" : "비밀번호 변경"}
          </button>
        </form>
      </AuthCard>
    </>
  );
}
