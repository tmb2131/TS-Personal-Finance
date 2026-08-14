import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface PageHeaderProps {
  title: string
  description?: string
  badges?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * Page title block.
 *
 * The title takes the editorial serif at the heading step — a full size above
 * the KPI values beneath it. Previously both sat at the figure step, so "where
 * am I" and "what is the number" carried identical weight and the page had no
 * top to it. Still no fill and no accent bar: hierarchy comes from size and
 * face, which costs no colour.
 */
export function PageHeader({ title, description, badges, actions, className }: PageHeaderProps) {
  return (
    /* Actions only move up beside the title at lg. At md the two columns fight
       for a ~700px content area and the description gets squeezed into a
       three-line ribbon next to a pair of buttons. */
    <div className={cn('flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="editorial text-heading text-foreground">{title}</h1>
        {description && <p className="text-body text-muted-foreground">{description}</p>}
        {badges && <div className="flex flex-wrap items-center gap-2 pt-1 text-meta">{badges}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      )}
    </div>
  )
}

export function PageHeaderBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border bg-raised px-2.5 py-1 font-medium text-muted-foreground">
      {children}
    </span>
  )
}
