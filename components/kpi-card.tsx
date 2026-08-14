'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { cn } from '@/utils/cn'

interface KPICardProps {
  title: string
  value: number
  subtitle?: string
  /**
   * A variance against budget or target. This is the only thing in the app
   * allowed to carry colour, so pass it only when the number genuinely reports
   * over/under — never as decoration for a figure that is merely large.
   */
  variance?: {
    value: number
    isPositive: boolean
  }
  /**
   * This figure's share of a whole, 0–1. Draws a proportion rule under the
   * value. Use it where the reader would otherwise have to divide two KPI cards
   * in their head — "liquid assets" against "total net worth", say.
   */
  share?: number
  /** As-of date for figures drawn from a feed that may be stale. */
  asOf?: string
  /** Footnote for exclusions the reader would otherwise have to guess at. */
  note?: string
  className?: string
}

export function KPICard({
  title,
  value,
  subtitle,
  variance,
  share,
  asOf,
  note,
  className,
}: KPICardProps) {
  const { currency } = useCurrency()

  const formatValue = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val)

  const footnote = [note, asOf ? `As of ${asOf}` : null].filter(Boolean).join(' · ')

  return (
    <Card className={cn('h-full w-full min-w-0', className)}>
      {/* Label, figure, then everything qualifying it — in that order, with the
          gap after the figure larger than the gaps within the qualifiers, so the
          eye lands on the number first and the caveats read as one block. */}
      <CardContent className="flex h-full flex-col gap-1">
        <p className="eyebrow">{title}</p>
        <p className="figure text-figure text-foreground">{formatValue(value)}</p>

        {share !== undefined && (
          <span
            className="meter mt-1 h-1 w-full"
            role="img"
            aria-label={`${Math.round(share * 100)}% of total`}
          >
            <span
              className="meter-fill"
              style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
            />
          </span>
        )}

        {(subtitle || variance || footnote) && (
          <div className="mt-1 space-y-0.5">
            {variance && (
              <p
                className={cn(
                  'num text-meta font-semibold',
                  variance.isPositive ? 'text-positive' : 'text-negative',
                )}
              >
                {variance.isPositive ? '+' : ''}
                {variance.value}%
              </p>
            )}
            {subtitle && <p className="text-meta text-muted-foreground">{subtitle}</p>}
            {footnote && <p className="text-meta text-muted-foreground">{footnote}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
