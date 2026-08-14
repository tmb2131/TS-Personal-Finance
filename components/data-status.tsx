'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useSync } from '@/lib/contexts/sync-context'

/**
 * Data freshness, as one control.
 *
 * The header used to print `Sources: 2 · Latest Transaction: 14 Aug 2026 ·
 * Latest Account: 31 Jul 2026` as raw label/value pairs across the top of every
 * page — three facts that are checked occasionally holding permanent chrome and
 * reading like a debug strip. The answer people actually want at a glance is
 * "is this current", so that is the pill; the three dates live one click behind
 * it.
 */
export function DataStatus({ className }: { className?: string }) {
  const {
    syncing,
    ingestionStatus,
    lastRefreshDate,
    formatLastSheetSync,
    latestTransactionDate,
    maxAccountDate,
    formatDate,
  } = useSync()

  const freshness = ingestionStatus?.freshness ?? null

  let label: string
  /** The header is tight on a phone, so the timestamp drops and the word stays. */
  let shortLabel: string
  let dotClass: string
  let toneClass: string

  if (syncing) {
    label = 'Syncing…'
    shortLabel = 'Syncing'
    dotClass = 'bg-primary animate-pulse'
    toneClass = 'text-muted-foreground'
  } else if (freshness === 'setup') {
    label = 'Add a source'
    shortLabel = 'Set up'
    dotClass = 'bg-negative'
    toneClass = 'text-foreground'
  } else if (freshness === 'stale') {
    label = `Stale · ${formatLastSheetSync(lastRefreshDate)}`
    shortLabel = 'Stale'
    dotClass = 'bg-negative'
    toneClass = 'text-foreground'
  } else if (freshness === 'fresh') {
    label = `Fresh · ${formatLastSheetSync(lastRefreshDate)}`
    shortLabel = 'Fresh'
    dotClass = 'bg-positive'
    toneClass = 'text-muted-foreground'
  } else {
    label = formatLastSheetSync(lastRefreshDate)
    shortLabel = 'Synced'
    dotClass = 'bg-muted-foreground'
    toneClass = 'text-muted-foreground'
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Connected sources', value: String(ingestionStatus?.connectedSources ?? 0) },
    { label: 'Latest transaction', value: formatDate(latestTransactionDate) },
    { label: 'Latest account balance', value: formatDate(maxAccountDate) },
  ]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-meta font-medium whitespace-nowrap transition-colors',
          'hover:border-border-strong hover:bg-accent',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          'data-[state=open]:border-border-strong data-[state=open]:bg-accent',
          toneClass,
          className,
        )}
        aria-label={`Data freshness: ${label}. Show source detail.`}
      >
        <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} aria-hidden />
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden max-w-[13rem] truncate sm:inline">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-overlay animate-in fade-in-0 zoom-in-95"
        >
          <p className="eyebrow px-2.5 pb-1 pt-2">Data freshness</p>
          <dl className="px-2.5 pb-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0"
              >
                <dt className="text-meta text-muted-foreground">{row.label}</dt>
                <dd className="num text-meta font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
          {ingestionStatus?.freshnessLabel && (
            <p className="border-t border-border px-2.5 py-2 text-meta text-muted-foreground">
              {ingestionStatus.freshnessLabel}
            </p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
