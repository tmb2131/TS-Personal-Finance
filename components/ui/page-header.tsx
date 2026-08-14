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
 * Page title block. Deliberately unfilled and unaccented: a page header is
 * chrome, and the numbers below it are the content. It used to carry a muted
 * gradient and a coloured left border that varied per page, which put the
 * loudest treatment on the least informative element.
 */
export function PageHeader({ title, description, badges, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('border-b pb-4', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-figure font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-body text-muted-foreground">{description}</p>}
          {badges && <div className="flex flex-wrap gap-2 pt-1 text-meta">{badges}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div>
        )}
      </div>
    </div>
  )
}

export function PageHeaderBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border bg-background px-2.5 py-1 font-medium">{children}</span>
  )
}
