import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/cn"

/**
 * Badges label, they do not shout. The default is a tinted chip rather than a
 * solid fill — a solid brand-coloured badge next to a currency figure competes
 * with the figure, and there are usually several badges to one figure.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-tint text-primary",
        secondary: "border-transparent bg-muted text-muted-foreground",
        positive: "border-transparent bg-positive-tint text-positive",
        negative: "border-transparent bg-negative-tint text-negative",
        destructive: "border-transparent bg-negative-tint text-negative",
        outline: "border-border text-muted-foreground",
        /** Currency and unit tags inside tables. */
        code: "num border-border bg-sunken px-1.5 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
