'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TransactionLog } from '@/lib/types'
import { useCurrency } from '@/lib/contexts/currency-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Receipt } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTransactions } from '@/lib/hooks/queries/use-transactions'
import {
  DATE_PRESETS,
  fetchDaysForPreset,
  getPriorWindow,
  getWindowForPreset,
  isInWindow,
  type DatePresetId,
} from '@/lib/date-presets'
import {
  TransactionFilterBar,
  type TransactionFilterValue,
} from './transactions-filter-bar'
import { FilteredTotalsRow } from './filtered-totals-row'

const VALID_PRESET_IDS = new Set<DatePresetId>(DATE_PRESETS.map((p) => p.id))

/**
 * The list renders one ~66px card per transaction, grouped by day. The default
 * three-month range is around a thousand rows for an active account, which is
 * roughly 70,000px — fine when this was its own page, far too much as one
 * section among five on /spending. Render a screenful and let the reader ask
 * for more; the totals row above still reports the whole filtered set.
 */
const INITIAL_VISIBLE = 25
const LOAD_MORE_STEP = 50

function readPreset(value: string | null): DatePresetId {
  if (value && VALID_PRESET_IDS.has(value as DatePresetId)) return value as DatePresetId
  return 'last-3-months'
}

function readCategories(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function TransactionsList() {
  const { currency, fxRate } = useCurrency()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialFilter = useMemo<TransactionFilterValue>(
    () => ({
      search: searchParams.get('q') ?? '',
      preset: readPreset(searchParams.get('range')),
      categories: readCategories(searchParams.get('cat')),
    }),
    // Initialize from URL once on mount; subsequent updates flow through onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [filter, setFilter] = useState<TransactionFilterValue>(initialFilter)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)

  // Reflect filter into URL so views are shareable.
  useEffect(() => {
    const params = new URLSearchParams()
    if (filter.search) params.set('q', filter.search)
    if (filter.preset !== 'last-3-months') params.set('range', filter.preset)
    if (filter.categories.length > 0) params.set('cat', filter.categories.join(','))
    const next = params.toString()
    const current = searchParams.toString()
    if (next !== current) {
      router.replace(next ? `?${next}` : '?', { scroll: false })
    }
  }, [filter, router, searchParams])

  // A previous expansion should not carry into a different result set.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE)
  }, [filter.search, filter.preset, filter.categories])

  const fetchDays = useMemo(() => fetchDaysForPreset(filter.preset), [filter.preset])
  const { data: transactions = [], isLoading: loading, error: queryError } =
    useTransactions(fetchDays)
  const error = queryError?.message ?? null

  const window = useMemo(() => getWindowForPreset(filter.preset), [filter.preset])
  const priorWindow = useMemo(() => (window ? getPriorWindow(window) : null), [window])

  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((t) => {
      if (t.category?.trim()) set.add(t.category.trim())
    })
    return Array.from(set).sort()
  }, [transactions])

  const filteredTransactions = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    const catFilter = new Set(filter.categories)
    return transactions.filter((t) => {
      if (!isInWindow(t.date, window)) return false
      const matchSearch =
        !q ||
        (t.counterparty?.toLowerCase().includes(q) ?? false) ||
        (t.category?.toLowerCase().includes(q) ?? false)
      const matchCategory = catFilter.size === 0 || (t.category && catFilter.has(t.category.trim()))
      return matchSearch && matchCategory
    })
  }, [transactions, filter.search, filter.categories, window])

  const priorTransactions = useMemo(() => {
    if (!priorWindow) return [] as TransactionLog[]
    const q = filter.search.trim().toLowerCase()
    const catFilter = new Set(filter.categories)
    return transactions.filter((t) => {
      if (!isInWindow(t.date, priorWindow)) return false
      const matchSearch =
        !q ||
        (t.counterparty?.toLowerCase().includes(q) ?? false) ||
        (t.category?.toLowerCase().includes(q) ?? false)
      const matchCategory = catFilter.size === 0 || (t.category && catFilter.has(t.category.trim()))
      return matchSearch && matchCategory
    })
  }, [transactions, filter.search, filter.categories, priorWindow])

  const toDisplay = useMemo(() => {
    return (t: TransactionLog) => {
      const gbp = t.amount_gbp ?? 0
      const usd = t.amount_usd ?? 0
      const hasGbp = t.amount_gbp != null
      const amountInGbp = hasGbp ? gbp : usd / (fxRate || 1)
      const amountInUsd = hasGbp ? gbp * (fxRate || 1) : usd
      return currency === 'GBP' ? amountInGbp : amountInUsd
    }
  }, [currency, fxRate])

  const totals = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    for (const t of filteredTransactions) {
      const v = toDisplay(t)
      if (v >= 0) totalIn += v
      else totalOut += v
    }
    return { totalIn, totalOut, net: totalIn + totalOut }
  }, [filteredTransactions, toDisplay])

  const priorNet = useMemo(() => {
    if (!priorWindow || priorTransactions.length === 0) return null
    let sum = 0
    for (const t of priorTransactions) sum += toDisplay(t)
    return sum
  }, [priorTransactions, priorWindow, toDisplay])

  const visibleTransactions = useMemo(
    () => filteredTransactions.slice(0, visibleCount),
    [filteredTransactions, visibleCount],
  )
  const hiddenCount = filteredTransactions.length - visibleTransactions.length

  const transactionsByDay = useMemo(() => {
    const byDay = new Map<string, TransactionLog[]>()
    for (const t of visibleTransactions) {
      const dateStr = t.date
      if (!byDay.has(dateStr)) byDay.set(dateStr, [])
      byDay.get(dateStr)!.push(t)
    }
    const sortedDates = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a))
    return sortedDates.map((dateStr) => ({ dateStr, transactions: byDay.get(dateStr)! }))
  }, [visibleTransactions])

  const symbol = currency === 'GBP' ? '£' : '$'

  const formatDayHeader = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, (m ?? 1) - 1, d ?? 1)
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const getDayTotal = (dayTransactions: TransactionLog[]): number => {
    let sum = 0
    for (const t of dayTransactions) sum += toDisplay(t)
    return sum
  }

  const formatTotal = (value: number): string => {
    const prefix = value < 0 ? '-' : ''
    return `${prefix}${symbol}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatAmount = (t: TransactionLog): string => {
    const value = toDisplay(t)
    const formatted = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const prefix = value < 0 ? '-' : ''
    return `${prefix}${symbol}${formatted}`
  }

  const merchantInitial = (t: TransactionLog): string => {
    const name = t.counterparty?.trim() || ''
    if (name.length > 0) return name[0].toUpperCase()
    return 'T'
  }

  return (
    <div className="space-y-4">
      <TransactionFilterBar
        value={filter}
        onChange={setFilter}
        availableCategories={availableCategories}
      />

      {!loading && filteredTransactions.length > 0 && (
        <FilteredTotalsRow
          count={filteredTransactions.length}
          totalIn={totals.totalIn}
          totalOut={totals.totalOut}
          net={totals.net}
          priorNet={priorNet}
          symbol={symbol}
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : filteredTransactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions"
          description={
            transactions.length === 0
              ? 'No transactions in the selected date range.'
              : 'No transactions match your search or filter.'
          }
        />
      ) : (
        <div className="space-y-6">
          {transactionsByDay.map(({ dateStr, transactions: dayTransactions }) => {
            const dayTotal = getDayTotal(dayTransactions)
            return (
              <section key={dateStr} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {formatDayHeader(dateStr)}
                  </h3>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      dayTotal < 0 ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {formatTotal(dayTotal)}
                  </span>
                </div>
                <ul className="space-y-1">
                  {dayTransactions.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
                        aria-hidden
                      >
                        {merchantInitial(t)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {t.counterparty?.trim() || 'Unknown'}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{t.category || '—'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium text-foreground">{formatAmount(t)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          {hiddenCount > 0 && (
            <div className="flex flex-col items-center gap-2 border-t pt-4">
              <p className="num text-meta text-muted-foreground">
                Showing {visibleTransactions.length} of {filteredTransactions.length}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
              >
                Show {Math.min(LOAD_MORE_STEP, hiddenCount)} more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
