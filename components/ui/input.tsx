import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex min-h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-base transition-colors duration-150 file:border-0 file:bg-transparent file:text-sm file:font-semibold placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
