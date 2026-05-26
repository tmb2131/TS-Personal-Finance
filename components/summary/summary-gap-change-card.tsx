'use client'

import { Calendar, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/utils/cn'

export const GAP_CHANGE_THRESHOLD = 0.5

export type GapChangeDriver = {
  category: string
  delta: number
}

type SummaryGapChangeCardProps = {
  title: string
  footnote: string
  change: number | null
  changeLabel: string | null
  drivers: GapChangeDriver[]
  otherDriverDelta: number | null
  onNavigate: (path: string) => void
  cardContentClass: string
  formatCurrency: (value: number) => string
  className?: string
}

export function SummaryGapChangeCard({
  title,
  footnote,
  change,
  changeLabel,
  drivers,
  otherDriverDelta,
  onNavigate,
  cardContentClass,
  formatCurrency,
  className,
}: SummaryGapChangeCardProps) {
  const changeImproved =
    change != null && change < -GAP_CHANGE_THRESHOLD
  const changeWorsened =
    change != null && change > GAP_CHANGE_THRESHOLD

  return (
    <Card
      className={cn(
        'overflow-hidden border-l-[3px]',
        changeImproved
          ? 'border-l-green-500'
          : changeWorsened
            ? 'border-l-red-500'
            : 'border-l-slate-400 dark:border-l-slate-500',
        className
      )}
    >
      <CardContent className={cardContentClass}>
        <button
          type="button"
          onClick={() => onNavigate('/analysis#forecast-evolution')}
          className="flex items-center justify-between w-full gap-1.5 mb-2 group hover:opacity-70 transition-opacity text-left"
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                changeImproved
                  ? 'bg-green-500/15'
                  : changeWorsened
                    ? 'bg-red-500/15'
                    : 'bg-muted'
              )}
            >
              <Calendar
                className={cn(
                  'h-4 w-4',
                  changeImproved
                    ? 'text-green-600 dark:text-green-400'
                    : changeWorsened
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground'
                )}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
          </div>
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        {change !== null && changeLabel && (
          <>
            <div
              className={cn(
                'text-3xl sm:text-2xl font-bold tabular-nums leading-none',
                changeImproved
                  ? 'text-green-600 dark:text-green-400'
                  : changeWorsened
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'
              )}
            >
              {formatCurrency(Math.abs(change))}
            </div>
            <p
              className={cn(
                'mt-1.5 text-sm opacity-80',
                changeImproved
                  ? 'text-green-600 dark:text-green-400'
                  : changeWorsened
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'
              )}
            >
              {changeLabel}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">{footnote}</p>
          </>
        )}
        {drivers.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs sm:text-[10px] font-bold text-muted-foreground">
                Top Drivers
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/analysis#forecast-evolution')}
                className="text-xs font-medium text-primary hover:opacity-80 transition-opacity sm:hidden"
              >
                View all
              </button>
            </div>
            {(() => {
              const maxDelta = Math.max(
                ...drivers.map((d) => Math.abs(d.delta)),
                1
              )
              return (
                <div className="space-y-1.5">
                  {drivers.map((driver) => {
                    const pct = (Math.abs(driver.delta) / maxDelta) * 100
                    const isWorsening = driver.delta > 0
                    return (
                      <div key={driver.category} className="flex items-center gap-2">
                        <span className="text-xs sm:text-[10px] w-24 sm:w-16 truncate text-muted-foreground font-medium">
                          {driver.category}
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              isWorsening ? 'bg-red-500' : 'bg-green-500'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            'text-xs sm:text-[10px] font-medium tabular-nums w-14 sm:w-11 text-right shrink-0',
                            isWorsening ? 'text-red-600' : 'text-green-600'
                          )}
                        >
                          {formatCurrency(Math.abs(driver.delta))}
                        </span>
                      </div>
                    )
                  })}
                  {otherDriverDelta != null && (
                    <p className="text-[10px] text-muted-foreground pt-0.5">
                      Other categories:{' '}
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          otherDriverDelta < 0
                            ? 'text-green-600'
                            : otherDriverDelta > 0
                              ? 'text-red-600'
                              : ''
                        )}
                      >
                        {otherDriverDelta < 0 ? '−' : '+'}
                        {formatCurrency(Math.abs(otherDriverDelta))}
                      </span>
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
