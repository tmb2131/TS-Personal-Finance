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
  /** As-of date for figures drawn from a feed that may be stale. */
  asOf?: string
  /** Footnote for exclusions the reader would otherwise have to guess at. */
  note?: string
  className?: string
}

export function KPICard({ title, value, subtitle, variance, asOf, note, className }: KPICardProps) {
  const { currency } = useCurrency()

  const formatValue = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val)

  return (
    <Card className={cn('h-full w-full min-w-0', className)}>
      <CardContent className="space-y-1">
        <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="figure text-figure">{formatValue(value)}</p>
        {subtitle && <p className="text-meta text-muted-foreground">{subtitle}</p>}
        {variance && (
          <p
            className={cn(
              'num text-meta font-medium',
              variance.isPositive ? 'text-positive' : 'text-negative',
            )}
          >
            {variance.isPositive ? '+' : ''}
            {variance.value}%
          </p>
        )}
        {(asOf || note) && (
          <p className="text-meta text-muted-foreground">
            {[note, asOf ? `As of ${asOf}` : null].filter(Boolean).join(' · ')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
