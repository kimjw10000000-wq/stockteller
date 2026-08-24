"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type HeaderUser = {
  email: string;
};

export function HeaderAuth() {
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user?.email ? { email: data.user.email } : null);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user?.email ? { email: session.user.email } : null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const onLogout = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }, [router]);

  if (!ready) {
    return <div className="h-9 w-[4.5rem] shrink-0" aria-hidden />;
  }

  if (user) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden max-w-[9rem] truncate text-xs text-muted-foreground sm:inline" title={user.email}>
          {user.email}
        </span>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("header.logout")}</span>
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      prefetch
      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:px-3"
    >
      <LogIn className="h-4 w-4" aria-hidden />
      {t("header.login")}
    </Link>
  );
}
