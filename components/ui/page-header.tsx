import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Accent = 'blue' | 'purple' | 'violet' | 'indigo' | 'slate' | 'orange' | 'emerald' | 'none'

const ACCENT_CLASSES: Record<Accent, string> = {
  blue: 'border-l-[3px] border-l-blue-500',
  purple: 'border-l-[3px] border-l-purple-500',
  violet: 'border-l-[3px] border-l-violet-500',
  indigo: 'border-l-[3px] border-l-indigo-500',
  slate: 'border-l-[3px] border-l-slate-500',
  orange: 'border-l-[3px] border-l-orange-500',
  emerald: 'border-l-[3px] border-l-emerald-500',
  none: '',
}

interface PageHeaderProps {
  title: string
  description?: string
  accent?: Accent
  badges?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  accent = 'slate',
  badges,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-gradient-to-r from-muted/50 to-muted/30 p-4 md:p-5',
        ACCENT_CLASSES[accent],
        className,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm md:text-base text-muted-foreground">{description}</p>
          )}
          {badges && <div className="flex flex-wrap gap-2 pt-1 text-xs">{badges}</div>}
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
