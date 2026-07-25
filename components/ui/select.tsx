import * as React from "react";
import { cn } from "@/lib/utils";

// Native select, styled to match inputs — avoids a JS dependency and works
// everywhere (including the door-scanner phones).
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex min-h-11 w-full appearance-none rounded-lg border border-input bg-background px-4 py-2 text-base transition-colors duration-150 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

export { Select };
