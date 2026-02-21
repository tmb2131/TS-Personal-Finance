'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TransactionLog } from '@/lib/types'
import { useCurrency } from '@/lib/contexts/currency-context'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Search, Filter, Receipt } from 'lucide-react'
import { cn } from '@/utils/cn'
import { SYNC_COMPLETED_EVENT } from '@/components/header'

const DATE_RANGE_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All', days: null },
] as const

function formatDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function TransactionsList() {
  const { currency, fxRate } = useCurrency()
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRangeDays, setDateRangeDays] = useState<number | null>(90)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [fetchVersion, setFetchVersion] = useState(0)

  // Re-fetch when sync completes
  useEffect(() => {
    const onSyncCompleted = () => setFetchVersion((v) => v + 1)
    window.addEventListener(SYNC_COMPLETED_EVENT, onSyncCompleted)
    return () => window.removeEventListener(SYNC_COMPLETED_EVENT, onSyncCompleted)
  }, [])

  // Fetch transactions (all in range; we filter client-side for search/category)
  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true)
      const supabase = createClient()

      const today = new Date()
      const endDateStr = formatDateStr(today)
      let startDateStr: string
      if (dateRangeDays === null) {
        startDateStr = '2000-01-01' // effective "all"
      } else {
        const start = new Date(today)
        start.setDate(start.getDate() - dateRangeDays)
        startDateStr = formatDateStr(start)
      }

      const all: TransactionLog[] = []
      const pageSize = 1000
      let page = 0
      let hasMore = true

      while (hasMore) {
        const from = page * pageSize
        const to = from + pageSize - 1
        const { data, error: fetchError } = await supabase
          .from('transaction_log')
          .select('*')
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: false })
          .range(from, to)

        if (fetchError) {
          setError(fetchError.message)
          setLoading(false)
          return
        }
        const rows = (data || []) as TransactionLog[]
        all.push(...rows)
        hasMore = rows.length === pageSize
        page++
      }

      setTransactions(all)
      setError(null)
      setLoading(false)
    }

    fetchTransactions()
  }, [dateRangeDays, fetchVersion])

  // Unique categories from fetched data (for filter dropdown)
  const categories = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((t) => {
      if (t.category?.trim()) set.add(t.category.trim())
    })
    return Array.from(set).sort()
  }, [transactions])

  // Reset selected category if not in list
  useEffect(() => {
    if (categories.length > 0 && selectedCategory && !categories.includes(selectedCategory)) {
      setSelectedCategory('')
    }
  }, [categories, selectedCategory])

  // Filter by search and category
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return transactions.filter((t) => {
      const matchSearch =
        !q ||
        (t.counterparty?.toLowerCase().includes(q) ?? false) ||
        (t.category?.toLowerCase().includes(q) ?? false)
      const matchCategory = !selectedCategory || (t.category?.trim() === selectedCategory)
      return matchSearch && matchCategory
    })
  }, [transactions, searchQuery, selectedCategory])

  // Total of displayed transactions in display currency
  const totalDisplay = useMemo(() => {
    let sum = 0
    for (const t of filteredTransactions) {
      const gbp = t.amount_gbp ?? 0
      const usd = t.amount_usd ?? 0
      const hasGbp = t.amount_gbp != null
      const amountInGbp = hasGbp ? gbp : usd / (fxRate || 1)
      const amountInUsd = hasGbp ? gbp * (fxRate || 1) : usd
      const displayValue = currency === 'GBP' ? amountInGbp : amountInUsd
      sum += displayValue
    }
    return sum
  }, [filteredTransactions, currency, fxRate])

  // Group filtered transactions by day (date string YYYY-MM-DD), sorted newest first
  const transactionsByDay = useMemo(() => {
    const byDay = new Map<string, TransactionLog[]>()
    for (const t of filteredTransactions) {
      const dateStr = t.date
      if (!byDay.has(dateStr)) byDay.set(dateStr, [])
      byDay.get(dateStr)!.push(t)
    }
    const sortedDates = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a))
    return sortedDates.map((dateStr) => ({ dateStr, transactions: byDay.get(dateStr)! }))
  }, [filteredTransactions])

  const formatDayHeader = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, (m ?? 1) - 1, d ?? 1)
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const getDayTotal = (dayTransactions: TransactionLog[]): number => {
    let sum = 0
    for (const t of dayTransactions) {
      const gbp = t.amount_gbp ?? 0
      const usd = t.amount_usd ?? 0
      const hasGbp = t.amount_gbp != null
      const amountInGbp = hasGbp ? gbp : usd / (fxRate || 1)
      const amountInUsd = hasGbp ? gbp * (fxRate || 1) : usd
      sum += currency === 'GBP' ? amountInGbp : amountInUsd
    }
    return sum
  }

  const formatTotal = (value: number): string => {
    const prefix = value < 0 ? '-' : ''
    const symbol = currency === 'GBP' ? '£' : '$'
    return `${prefix}${symbol}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Close filter when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false)
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [filterOpen])

  const formatAmount = (t: TransactionLog): string => {
    const gbp = t.amount_gbp ?? 0
    const usd = t.amount_usd ?? 0
    const hasGbp = t.amount_gbp != null
    const amountInGbp = hasGbp ? gbp : usd / (fxRate || 1)
    const amountInUsd = hasGbp ? gbp * (fxRate || 1) : usd
    const value = currency === 'GBP' ? amountInGbp : amountInUsd
    const symbol = currency === 'GBP' ? '£' : '$'
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
      <h1 className="text-2xl md:text-3xl font-bold">Transactions</h1>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative" ref={filterRef}>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full shrink-0"
            onClick={() => setFilterOpen(!filterOpen)}
            aria-label="Filter"
          >
            <Filter className="h-4 w-4" />
          </Button>
          {filterOpen && (
            <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-lg border bg-popover p-3 shadow-md">
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Date range</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_RANGE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.label}
                        variant={dateRangeDays === opt.days ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setDateRangeDays(opt.days)
                        }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                {categories.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Category</p>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      <option value="">All categories</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Recent transactions</h2>
        {!loading && (
          <span className={cn('text-sm font-medium', totalDisplay < 0 ? 'text-foreground' : 'text-muted-foreground')}>
            {totalDisplay < 0 ? '-' : ''}
            {currency === 'GBP' ? '£' : '$'}
            {Math.abs(totalDisplay).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

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
              ? "No transactions in the selected date range."
              : "No transactions match your search or filter."
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
                      dayTotal < 0 ? 'text-foreground' : 'text-muted-foreground'
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
        </div>
      )}
    </div>
  )
}
