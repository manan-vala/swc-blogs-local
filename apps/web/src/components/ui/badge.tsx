import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Status pill for post state (Draft/Published/Archived/sync-failed).
// Semantic colour, kept separate from the accent-token system —
// this is app chrome, not part of a club's branding.
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-neutral-100 text-neutral-700",
        success: "bg-green-100 text-green-800",
        warning: "bg-amber-100 text-amber-800",
        critical: "bg-red-100 text-red-800",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
