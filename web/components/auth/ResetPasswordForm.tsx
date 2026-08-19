"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapAuthError, validatePassword } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

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
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-sm font-medium">
            새 비밀번호
          </label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={!ready}
          />
          <p className="text-xs text-muted-foreground">8자 이상, 영문과 숫자를 함께 사용하세요.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new-password-confirm" className="text-sm font-medium">
            새 비밀번호 확인
          </label>
          <Input
            id="new-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={!ready}
          />
        </div>
        {error ? (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading || !ready}>
          {loading ? "변경 중…" : "비밀번호 변경"}
        </Button>
      </form>
    </div>
  );
}
