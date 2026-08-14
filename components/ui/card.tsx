import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/cn"

/**
 * A card is a plane, not an outline.
 *
 * Its edges come from a tonal step against the canvas plus a layered shadow;
 * the hairline border is a seam, not the structure. That is what lets a card
 * still read as a card on the dark ground, where the previous border-only
 * treatment left every panel looking like a wireframe.
 *
 * `flush` exists to kill the nested-card problem: a table or sub-panel that
 * lives inside a card takes `flush` so it contributes no second border. Two
 * concentric rounded borders is the single most dating detail in a dashboard.
 */
const cardVariants = cva(
  // The compound selector collapses the gap when content directly follows a
  // header, so the two do not double up their padding. Doing it here rather
  // than as a default on CardContent keeps a bare CardContent — a card with no
  // header at all — correctly padded on all four sides.
  "rounded-lg text-card-foreground transition-shadow duration-200 [&>[data-slot=card-header]+[data-slot=card-content]]:pt-0",
  {
    variants: {
      variant: {
        default: "surface-card",
        raised: "surface-raised",
        /** Sits inside another card. No border, no shadow, no second radius. */
        flush: "bg-transparent",
        /** A well inside a card — used for totals rows and inset tables. */
        sunken: "surface-sunken",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  )
)
Card.displayName = "Card"

/**
 * Header. Lays title and actions on one row at md+ so the "Edit all" style
 * button belongs to its card instead of floating orphaned above or below it.
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-header"
    className={cn(
      "flex flex-col gap-1.5 px-4 pb-3 pt-4 md:px-5 md:pb-4 md:pt-5",
      className
    )}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

/**
 * Title row with an optional trailing action slot. Use this rather than
 * hand-rolling a flex row per card, so every card puts its controls in the
 * same place.
 */
const CardTitleRow = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { actions?: React.ReactNode }
>(({ className, children, actions, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}
    {...props}
  >
    <div className="min-w-0 space-y-1">{children}</div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
))
CardTitleRow.displayName = "CardTitleRow"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-title font-semibold", className)} {...props} />
))
CardTitle.displayName = "CardTitle"

/** Small uppercase label above a figure. */
const CardEyebrow = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("eyebrow", className)} {...props} />
))
CardEyebrow.displayName = "CardEyebrow"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-body text-muted-foreground", className)} {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    /** Drop the horizontal padding so a table can run edge to edge. */
    bleed?: boolean
  }
>(({ className, bleed, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-content"
    className={cn(
      "pt-4 md:pt-5",
      bleed ? "pb-2 md:pb-3" : "px-4 pb-4 md:px-5 md:pb-5",
      className
    )}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center gap-2 border-t px-4 py-3 md:px-5 md:py-3.5",
      className
    )}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardTitleRow,
  CardEyebrow,
  CardDescription,
  CardContent,
  cardVariants,
}
