"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import {
  OTP_RESEND_SEC,
  OTP_TTL_SEC,
  RECOVERY_OTP_LENGTH,
  RECOVERY_OTP_PLACEHOLDER,
  mapAuthError,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

function formatRemain(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remain, setRemain] = useState(OTP_TTL_SEC);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 2) return;
    setRemain(OTP_TTL_SEC);
    const id = window.setInterval(() => {
      setRemain((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  async function sendOtp(nextStep: Step = 2) {
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (cooldown > 0) {
      setError(`인증번호는 ${cooldown}초 후에 다시 받을 수 있습니다.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/recover/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "인증 메일을 보내지 못했습니다.");
        return;
      }
      setOtp("");
      setCooldown(OTP_RESEND_SEC);
      setStep(nextStep);
    } catch {
      setError("인증 메일을 보내지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (remain <= 0) {
      setError("인증번호가 만료되었습니다. 다시 받아 주세요.");
      return;
    }
    const token = otp.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (token.length !== RECOVERY_OTP_LENGTH) {
      setError(`${RECOVERY_OTP_LENGTH}자리 인증번호를 입력해 주세요.`);
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "recovery",
    });
    setLoading(false);
    if (verifyError) {
      setError(mapAuthError(verifyError.message, verifyError.code));
      return;
    }
    setStep(3);
  }

  async function updatePassword() {
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
    if (updateError) {
      setLoading(false);
      setError(mapAuthError(updateError.message, updateError.code));
      return;
    }
    await supabase.auth.signOut();
    setLoading(false);
    setToast("비밀번호가 성공적으로 변경되었습니다");
    window.setTimeout(() => {
      router.replace("/login");
      router.refresh();
    }, 1200);
  }

  return (
    <>
      <AuthToast message={toast} />
      <AuthCard
        title="비밀번호 찾기"
        subtitle={
          step === 1
            ? "가입한 이메일로 인증번호를 보냅니다."
            : step === 2
              ? `${email} 으로 보낸 ${RECOVERY_OTP_LENGTH}자리 코드를 입력하세요.`
              : "새 비밀번호를 설정하세요."
        }
        step={step}
      >
        {step === 1 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendOtp(2);
            }}
          >
            <AuthField id="recover-email" label="이메일">
              <input
                id="recover-email"
                className={authInputClass}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </AuthField>
            <AuthError message={error} />
            <button
              type="submit"
              className={authPrimaryBtnClass}
              disabled={loading || cooldown > 0}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading
                ? "보내는 중…"
                : cooldown > 0
                  ? `인증번호 발송 (${cooldown}s)`
                  : "인증번호 발송"}
            </button>
          </form>
        ) : null}

        {step === 2 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyOtp();
            }}
          >
            <AuthField id="recover-otp" label="인증번호">
              <input
                id="recover-otp"
                className={cn(authInputClass, "text-center text-2xl tracking-[0.35em]")}
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={RECOVERY_OTP_LENGTH}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, RECOVERY_OTP_LENGTH))
                }
                placeholder={RECOVERY_OTP_PLACEHOLDER}
                required
              />
            </AuthField>
            <p className={cn("text-center text-sm", remain === 0 ? "text-rose-400" : "text-zinc-400")}>
              {remain === 0 ? "시간 만료" : `남은 시간 ${formatRemain(remain)}`}
            </p>
            <AuthError message={error} />
            <button type="submit" className={authPrimaryBtnClass} disabled={loading || remain === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "확인 중…" : "인증하기"}
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline disabled:opacity-50"
              disabled={loading || cooldown > 0}
              onClick={() => void sendOtp(2)}
            >
              {cooldown > 0 ? `재전송 (${cooldown}s)` : "인증번호 재전송"}
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
              disabled={loading}
              onClick={() => {
                setStep(1);
                setError("");
              }}
            >
              이메일 다시 입력
            </button>
          </form>
        ) : null}

        {step === 3 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void updatePassword();
            }}
          >
            <AuthField id="recover-password" label="새 비밀번호" hint="8자 이상, 영문과 숫자를 함께 사용하세요.">
              <AuthPasswordInput
                id="recover-password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                required
              />
            </AuthField>
            <AuthField id="recover-confirm" label="새 비밀번호 확인">
              <AuthPasswordInput
                id="recover-confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={setConfirm}
                required
              />
            </AuthField>
            <AuthError message={error} />
            <button type="submit" className={authPrimaryBtnClass} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "변경 중…" : "비밀번호 변경 완료"}
            </button>
          </form>
        ) : null}

        <p className="mt-5 text-center text-sm">
          <Link href="/login" className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
