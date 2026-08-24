"use client";

import { cn } from "@/lib/utils";

type AlertToggleProps = {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
};

export function AlertToggle({ checked, disabled, onChange, label }: AlertToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? (checked ? "알람 켜기" : "알람 끄기")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-sky-400" : "bg-slate-200"
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200",
          checked && "translate-x-5"
        )}
      />
    </button>
  );
}
