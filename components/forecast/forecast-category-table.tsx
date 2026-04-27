'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCurrency } from '@/lib/contexts/currency-context'
import type {
  EnsembleCategory,
  TransactionForecastResult,
} from '@/lib/forecast-transaction-based'
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react'

type SortKey =
  | 'category'
  | 'ytd'
  | 'm1'
  | 'm2'
  | 'm3'
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

  const sorted = useMemo(() => {
    const list = [...categories]
    list.sort((a, b) => {
      const av = readKey(a, sortKey)
      const bv = readKey(b, sortKey)
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const ax = Number(av) || 0
      const bx = Number(bv) || 0
      return sortDir === 'asc' ? ax - bx : bx - ax
    })
    return list
  }, [categories, sortKey, sortDir])

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
        <CardTitle className="text-lg md:text-xl">Forecast by category</CardTitle>
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
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(c.ytd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(c.byMethodology.m1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(c.byMethodology.m2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(c.byMethodology.m3)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                      {fmt(c.fullYearLow)}
                      <span className="px-1">–</span>
                      {fmt(c.fullYearHigh)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(c.fullYearBase)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pyDelta == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            pyDelta >= 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
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
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.ytd)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.byMethodology.m1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.byMethodology.m2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.byMethodology.m3)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {fmt(totals.fullYearLow)}
                  <span className="px-1">–</span>
                  {fmt(totals.fullYearHigh)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.fullYearBase)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
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

function readKey(c: EnsembleCategory, k: SortKey): number | string {
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
    case 'fullYearBase':
      return c.fullYearBase
    case 'range':
      return c.fullYearHigh - c.fullYearLow
    case 'priorYear':
      return c.priorYearActual > 0 ? c.fullYearBase / c.priorYearActual : 0
  }
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
