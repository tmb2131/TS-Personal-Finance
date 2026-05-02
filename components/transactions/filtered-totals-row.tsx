'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/utils/cn'

interface FilteredTotalsRowProps {
  count: number
  totalIn: number
  totalOut: number
  net: number
  priorNet: number | null
  symbol: string
}

function formatMoney(value: number, symbol: string) {
  const prefix = value < 0 ? '-' : ''
  return `${prefix}${symbol}${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDelta(value: number, symbol: string) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${symbol}${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`
}

export function FilteredTotalsRow({
  count,
  totalIn,
  totalOut,
  net,
  priorNet,
  symbol,
}: FilteredTotalsRowProps) {
  const delta = priorNet == null ? null : net - priorNet
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown

  return (
    <div className="rounded-lg border bg-card p-3 md:p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Transactions</p>
          <p className="text-lg font-semibold">{count.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">In</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalIn, symbol)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Out</p>
          <p className="text-lg font-semibold text-foreground">
            {formatMoney(-Math.abs(totalOut), symbol)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net</p>
          <div className="flex items-baseline gap-2">
            <p
              className={cn(
                'text-lg font-semibold',
                net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
              )}
            >
              {formatMoney(net, symbol)}
            </p>
            {delta != null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs',
                  delta === 0
                    ? 'text-muted-foreground'
                    : delta > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                )}
                title="vs comparable prior period"
              >
                <DeltaIcon className="h-3 w-3" aria-hidden />
                {formatDelta(delta, symbol)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
