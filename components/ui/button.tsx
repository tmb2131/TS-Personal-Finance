import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/cn"

/**
 * Buttons are chrome. The brand teal appears here and on focus rings, and
 * almost nowhere else — which is what keeps a single primary button reading as
 * "the action" on a page otherwise full of numbers.
 *
 * `outline` is the workhorse (header controls, table actions) and is drawn on
 * the raised plane rather than the canvas, so it stays visible when it sits on
 * a card.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-body font-medium ring-offset-background",
    "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
    "[&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90",
        outline:
          "border border-border-strong bg-raised text-foreground shadow-card hover:border-border-strong hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-meta",
        lg: "h-11 rounded-md px-6",
        icon: "h-10 w-10",
        "icon-sm": "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
