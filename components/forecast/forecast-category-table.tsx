'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCurrency } from '@/lib/contexts/currency-context'
import type {
  BestFitCategoryPick,
  EnsembleCategory,
  MethodologyId,
  TransactionForecastResult,
} from '@/lib/forecast-transaction-based'
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react'

type SortKey =
  | 'category'
  | 'ytd'
  | 'm1'
  | 'm2'
  | 'm3'
  | 'bestFit'
  | 'fullYearBase'
  | 'range'
  | 'priorYear'

type SortDir = 'asc' | 'desc'

export function ForecastCategoryTable({
  data,
  categories,
  selectedCategory,
  onSelectCategory,
}: {
  data: TransactionForecastResult
  categories: EnsembleCategory[]
  selectedCategory: string | null
  onSelectCategory: (cat: string | null) => void
}) {
  const { currency, convertAmount } = useCurrency()
  const [sortKey, setSortKey] = useState<SortKey>('fullYearBase')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const fmt = (gbp: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(convertAmount(gbp, 'GBP'))

  const bestFit = data.bestFit
  const pickByCategory = useMemo(() => {
    const map = new Map<string, BestFitCategoryPick>()
    bestFit?.picks.forEach((p) => map.set(p.category, p))
    return map
  }, [bestFit])

  const bestFitFy = (cat: EnsembleCategory): number | null => {
    const pick = pickByCategory.get(cat.category)
    if (!pick) return null
    return cat.byMethodology[pick.picked]
  }

  const sorted = useMemo(() => {
    const list = [...categories]
    list.sort((a, b) => {
      const av = readKey(a, sortKey, bestFitFy)
      const bv = readKey(b, sortKey, bestFitFy)
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const ax = Number(av) || 0
      const bx = Number(bv) || 0
      return sortDir === 'asc' ? ax - bx : bx - ax
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, sortKey, sortDir, pickByCategory])

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'category' ? 'asc' : 'desc')
    }
  }

  const sortIcon = (k: SortKey) => {
    if (k !== sortKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const totals = data.ensemble.totals

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="md:">Forecast by category</CardTitle>
        <p className="text-xs text-muted-foreground">
          Click a category to see its full history and remaining-month forecast lines.
        </p>
      </CardHeader>
      <CardContent className="px-0 md:px-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <Th onClick={() => setSort('category')} icon={sortIcon('category')} align="left">
                  Category
                </Th>
                <Th onClick={() => setSort('ytd')} icon={sortIcon('ytd')} align="right">
                  YTD
                </Th>
                <Th onClick={() => setSort('m1')} icon={sortIcon('m1')} align="right">
                  M1 FY
                </Th>
                <Th onClick={() => setSort('m2')} icon={sortIcon('m2')} align="right">
                  M2 FY
                </Th>
                <Th onClick={() => setSort('m3')} icon={sortIcon('m3')} align="right">
                  M3 FY
                </Th>
                {bestFit && (
                  <Th onClick={() => setSort('bestFit')} icon={sortIcon('bestFit')} align="right">
                    Best fit
                  </Th>
                )}
                <Th onClick={() => setSort('range')} icon={sortIcon('range')} align="right">
                  Range
                </Th>
                <Th onClick={() => setSort('fullYearBase')} icon={sortIcon('fullYearBase')} align="right">
                  Base FY
                </Th>
                <Th onClick={() => setSort('priorYear')} icon={sortIcon('priorYear')} align="right">
                  vs PY
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const isSelected = selectedCategory === c.category
                const range = c.fullYearHigh - c.fullYearLow
                const pyDelta =
                  c.priorYearActual > 0
                    ? ((c.fullYearBase - c.priorYearActual) / c.priorYearActual) * 100
                    : null
                return (
                  <tr
                    key={c.category}
                    onClick={() => onSelectCategory(isSelected ? null : c.category)}
                    className={
                      'cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40 ' +
                      (isSelected ? 'bg-muted/60' : '')
                    }
                  >
                    <td className="px-3 py-2 font-medium">{c.category}</td>
                    <td className="px-3 py-2 text-right num">{fmt(c.ytd)}</td>
                    <td className="px-3 py-2 text-right num text-muted-foreground">{fmt(c.byMethodology.m1)}</td>
                    <td className="px-3 py-2 text-right num text-muted-foreground">{fmt(c.byMethodology.m2)}</td>
                    <td className="px-3 py-2 text-right num text-muted-foreground">{fmt(c.byMethodology.m3)}</td>
                    {bestFit && (
                      <td className="px-3 py-2 text-right num">
                        {(() => {
                          const pick = pickByCategory.get(c.category)
                          if (!pick) return <span className="text-muted-foreground">—</span>
                          const fy = c.byMethodology[pick.picked]
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              <MethodologyBadge
                                picked={pick.picked}
                                fallback={pick.fallback}
                                mape={pick.mape}
                              />
                              <span className="font-medium">{fmt(fy)}</span>
                            </span>
                          )
                        })()}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right num text-xs text-muted-foreground">
                      {fmt(c.fullYearLow)}
                      <span className="px-1">–</span>
                      {fmt(c.fullYearHigh)}
                    </td>
                    <td className="px-3 py-2 text-right num font-semibold">{fmt(c.fullYearBase)}</td>
                    <td className="px-3 py-2 text-right num">
                      {pyDelta == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            pyDelta >= 0
                              ? 'text-muted-foreground dark:text-muted-foreground'
                              : 'text-positive'
                          }
                        >
                          {pyDelta >= 0 ? '+' : ''}
                          {pyDelta.toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right num">{fmt(totals.ytd)}</td>
                <td className="px-3 py-2 text-right num">{fmt(totals.byMethodology.m1)}</td>
                <td className="px-3 py-2 text-right num">{fmt(totals.byMethodology.m2)}</td>
                <td className="px-3 py-2 text-right num">{fmt(totals.byMethodology.m3)}</td>
                {bestFit && (
                  <td className="px-3 py-2 text-right num">
                    <span className="inline-flex flex-col items-end leading-tight">
                      <span>{fmt(bestFit.fullYearTotal)}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {[
                          bestFit.pickCounts.m1 ? `M1×${bestFit.pickCounts.m1}` : null,
                          bestFit.pickCounts.m2 ? `M2×${bestFit.pickCounts.m2}` : null,
                          bestFit.pickCounts.m3 ? `M3×${bestFit.pickCounts.m3}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 text-right num text-xs">
                  {fmt(totals.fullYearLow)}
                  <span className="px-1">–</span>
                  {fmt(totals.fullYearHigh)}
                </td>
                <td className="px-3 py-2 text-right num">{fmt(totals.fullYearBase)}</td>
                <td className="px-3 py-2 text-right num">
                  {totals.priorYearActual > 0 ? (
                    <span>
                      {((totals.fullYearBase - totals.priorYearActual) / totals.priorYearActual) * 100 >= 0
                        ? '+'
                        : ''}
                      {(((totals.fullYearBase - totals.priorYearActual) / totals.priorYearActual) * 100).toFixed(0)}%
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {selectedCategory && (
          <div className="px-3 pt-3">
            <Button variant="ghost" size="sm" onClick={() => onSelectCategory(null)}>
              Clear selection
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function readKey(
  c: EnsembleCategory,
  k: SortKey,
  bestFitFy: (cat: EnsembleCategory) => number | null,
): number | string {
  switch (k) {
    case 'category':
      return c.category
    case 'ytd':
      return c.ytd
    case 'm1':
      return c.byMethodology.m1
    case 'm2':
      return c.byMethodology.m2
    case 'm3':
      return c.byMethodology.m3
    case 'bestFit':
      return bestFitFy(c) ?? 0
    case 'fullYearBase':
      return c.fullYearBase
    case 'range':
      return c.fullYearHigh - c.fullYearLow
    case 'priorYear':
      return c.priorYearActual > 0 ? c.fullYearBase / c.priorYearActual : 0
  }
}

const BADGE_STYLES: Record<MethodologyId, string> = {
  m1: 'bg-muted text-muted-foreground dark:text-muted-foreground',
  m2: 'bg-muted text-muted-foreground dark:text-muted-foreground',
  m3: 'bg-positive-tint text-positive',
}

function MethodologyBadge({
  picked,
  fallback,
  mape,
}: {
  picked: MethodologyId
  fallback: boolean
  mape: number | null
}) {
  const label = picked.toUpperCase()
  const tooltip = fallback
    ? `No backtest data — falling back to overall best (${label})`
    : mape != null
      ? `${label} picked — ${(mape * 100).toFixed(0)}% backtest error`
      : label
  return (
    <span
      title={tooltip}
      className={
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ' +
        (fallback ? 'bg-muted text-muted-foreground' : BADGE_STYLES[picked])
      }
    >
      {label}
      {fallback && <span className="ml-0.5 opacity-70">*</span>}
    </span>
  )
}

function Th({
  children,
  onClick,
  icon,
  align,
}: {
  children: React.ReactNode
  onClick: () => void
  icon: React.ReactNode
  align: 'left' | 'right'
}) {
  return (
    <th
      onClick={onClick}
      className={
        'cursor-pointer select-none px-3 py-2 ' +
        (align === 'right' ? 'text-right' : 'text-left')
      }
    >
      <div
        className={
          'inline-flex items-center gap-1 hover:text-foreground transition-colors ' +
          (align === 'right' ? 'flex-row-reverse' : '')
        }
      >
        <span>{children}</span>
        {icon}
      </div>
    </th>
  )
}
