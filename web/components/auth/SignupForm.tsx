"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthToast,
  authInputClass,
  authPrimaryBtnClass,
} from "@/components/auth/AuthCard";
import {
  AUTH_HOME,
  OTP_TTL_SEC,
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

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remain, setRemain] = useState(OTP_TTL_SEC);
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

  async function sendOtp() {
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpError) {
      setError(mapAuthError(otpError.message, otpError.code));
      return;
    }
    setOtp("");
    setStep(2);
  }

  async function verifyOtp() {
    if (remain <= 0) {
      setError("인증번호가 만료되었습니다. 다시 받아 주세요.");
      return;
    }
    const token = otp.replace(/\D/g, "");
    if (token.length !== 6) {
      setError("6자리 인증번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    setLoading(false);
    if (verifyError) {
      setError(mapAuthError(verifyError.message, verifyError.code));
      return;
    }
    setStep(3);
  }

  async function setPasswordAndFinish() {
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
    setToast("가입이 완료되었습니다.");
    window.setTimeout(() => {
      router.replace(AUTH_HOME);
      router.refresh();
    }, 1200);
  }

  return (
    <>
      <AuthToast message={toast} />
      <AuthCard
        title="회원가입"
        subtitle={
          step === 1
            ? "이메일이 아이디입니다. 인증번호를 보내 드립니다."
            : step === 2
              ? `${email} 으로 보낸 6자리 코드를 입력하세요.`
              : "비밀번호를 설정하면 가입이 끝납니다."
        }
        step={step}
      >
        {step === 1 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendOtp();
            }}
          >
            <AuthField id="signup-email" label="이메일">
              <input
                id="signup-email"
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
            <button type="submit" className={authPrimaryBtnClass} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "보내는 중…" : "인증번호 발송"}
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
            <AuthField id="signup-otp" label="인증번호">
              <input
                id="signup-otp"
                className={cn(authInputClass, "text-center text-2xl tracking-[0.4em]")}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
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
              className="w-full text-center text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
              disabled={loading}
              onClick={() => {
                setStep(1);
                setError("");
              }}
            >
              이메일 다시 입력 · 재발송
            </button>
          </form>
        ) : null}

        {step === 3 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void setPasswordAndFinish();
            }}
          >
            <AuthField id="signup-password" label="비밀번호" hint="8자 이상, 영문과 숫자를 함께 사용하세요.">
              <input
                id="signup-password"
                className={authInputClass}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </AuthField>
            <AuthField id="signup-confirm" label="비밀번호 확인">
              <input
                id="signup-confirm"
                className={authInputClass}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </AuthField>
            <AuthError message={error} />
            <button type="submit" className={authPrimaryBtnClass} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "가입 중…" : "가입 완료"}
            </button>
          </form>
        ) : null}

        <p className="mt-5 text-center text-sm text-zinc-400">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-medium text-zinc-100 underline-offset-4 hover:underline">
            로그인
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
