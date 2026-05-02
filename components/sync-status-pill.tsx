'use client'

import { cn } from '@/utils/cn'
import { useSync } from '@/lib/contexts/sync-context'

interface SyncStatusPillProps {
  className?: string
}

export function SyncStatusPill({ className }: SyncStatusPillProps) {
  const { syncing, ingestionStatus, lastRefreshDate, formatLastSheetSync } = useSync()

  const freshness = ingestionStatus?.freshness ?? null

  let label: string
  let dotClass: string
  let pillClass: string

  if (syncing) {
    label = 'Syncing…'
    dotClass = 'bg-blue-500 animate-pulse'
    pillClass = 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
  } else if (freshness === 'setup') {
    label = 'Add a source'
    dotClass = 'bg-amber-500'
    pillClass = 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  } else if (freshness === 'stale') {
    label = `Stale · ${formatLastSheetSync(lastRefreshDate)}`
    dotClass = 'bg-amber-500'
    pillClass = 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  } else if (freshness === 'fresh') {
    label = `Fresh · ${formatLastSheetSync(lastRefreshDate)}`
    dotClass = 'bg-emerald-500'
    pillClass = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  } else {
    label = formatLastSheetSync(lastRefreshDate)
    dotClass = 'bg-muted-foreground'
    pillClass = 'border-border bg-muted text-muted-foreground'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        pillClass,
        className,
      )}
      title={ingestionStatus?.freshnessLabel ?? undefined}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden />
      {label}
    </span>
  )
}
