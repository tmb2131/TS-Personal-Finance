import { cn } from '@/utils/cn'

/** Sync runs daily at 06:00 UTC; two missed runs means the feed is genuinely behind. */
const STALE_AFTER_DAYS = 2

function daysSince(date: string): number | null {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.floor((Date.now() - parsed.getTime()) / 864e5)
}

/**
 * As-of marker for a figure drawn from a feed that can lag.
 *
 * Staleness used to be visible only in the header pill, which meant a figure
 * could be quoted anywhere in the app with no indication of how old it was.
 * Some feeds lag much further than the daily sync — the education trust
 * valuation in particular — so the date travels with the number.
 */
export function AsOf({
  date,
  label = 'As of',
  className,
}: {
  date: string | null | undefined
  label?: string
  className?: string
}) {
  if (!date) return null

  const age = daysSince(date)
  const isStale = age !== null && age > STALE_AFTER_DAYS

  return (
    <span className={cn('num text-meta text-muted-foreground', className)}>
      {label} {date.slice(0, 10)}
      {isStale && age !== null ? ` · ${age} days old` : ''}
    </span>
  )
}
