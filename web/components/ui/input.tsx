import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "flex h-9 w-full min-w-0 rounded-md border border-border bg-input-background px-3 py-1 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          className
        )}
        {...props}
      />
    );
  }
);

export { Input };
