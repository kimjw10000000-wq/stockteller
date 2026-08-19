"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { oauthRedirectTo } from "@/lib/auth/validation";

type OAuthButtonsProps = {
  next?: string;
};

export function OAuthButtons({ next = "/" }: OAuthButtonsProps) {
  const [error, setError] = useState("");

  async function signIn(provider: "google" | "kakao") {
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: oauthRedirectTo(next) },
    });
    if (oauthError) {
      setError(oauthError.message || "소셜 로그인을 시작하지 못했습니다.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void signIn("google")}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <GoogleIcon />
        Google로 계속하기
      </button>
      <button
        type="button"
        onClick={() => void signIn("kakao")}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] text-sm font-medium text-[#191919] transition-colors hover:bg-[#f6dc00]"
      >
        <KakaoIcon />
        카카오로 계속하기
      </button>
      {error ? (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#191919"
        d="M12 3C6.477 3 2 6.463 2 10.7c0 2.72 1.823 5.11 4.563 6.48L5.6 20.96c-.12.43.4.77.76.5l4.02-2.66c.53.07 1.07.12 1.62.12 5.523 0 10-3.463 10-7.7S17.523 3 12 3z"
      />
    </svg>
  );
}
