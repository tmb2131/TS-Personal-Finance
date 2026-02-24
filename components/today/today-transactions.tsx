'use client'

import { useCurrency } from '@/lib/contexts/currency-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Receipt } from 'lucide-react'
import type { TodayTransactionRow } from '@/lib/today-types'

type TodayTransactionsProps = {
  transactions: TodayTransactionRow[]
}

export function TodayTransactions({ transactions }: TodayTransactionsProps) {
  const { currency, fxRate } = useCurrency()

  const formatAmount = (t: TodayTransactionRow): string => {
    const gbp = t.amount_gbp ?? 0
    const usd = t.amount_usd ?? 0
    const hasGbp = t.amount_gbp != null
    const amountInGbp = hasGbp ? gbp : usd / (fxRate || 1)
    const amountInUsd = hasGbp ? gbp * (fxRate || 1) : usd
    const value = currency === 'GBP' ? amountInGbp : amountInUsd
    const symbol = currency === 'GBP' ? '£' : '$'
    const formatted = Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    const prefix = value < 0 ? '-' : ''
    return `${prefix}${symbol}${formatted}`
  }

  const sortedTransactions = [...transactions].sort((a, b) => {
    const amtA = a.amount_gbp ?? a.amount_usd ?? 0
    const amtB = b.amount_gbp ?? b.amount_usd ?? 0
    return amtA - amtB
  })

  const netTotal = transactions.reduce((sum, t) => {
    const gbp = t.amount_gbp ?? 0
    const usd = t.amount_usd ?? 0
    const hasGbp = t.amount_gbp != null
    const amountInGbp = hasGbp ? gbp : usd / (fxRate || 1)
    const amountInUsd = hasGbp ? gbp * (fxRate || 1) : usd
    const value = currency === 'GBP' ? amountInGbp : amountInUsd
    return sum + value
  }, 0)
  const totalDisplay = Math.max(0, -netTotal)
  const totalFormatted =
    (currency === 'GBP' ? '£' : '$') +
    totalDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (transactions.length === 0) {
    return (
      <Card className="border-l-[3px] border-l-slate-500">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Today&apos;s transactions</CardTitle>
          <p className="text-sm text-muted-foreground">Expense transactions for today</p>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Receipt}
            title="No expenses today"
            description="No expense transactions recorded for today yet."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-[3px] border-l-slate-500">
      <CardHeader className="bg-muted/50">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <CardTitle className="text-xl">Today&apos;s transactions</CardTitle>
            <p className="text-sm text-muted-foreground">Expense transactions for today</p>
          </div>
          <p className="text-lg font-semibold tabular-nums">{totalFormatted}</p>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {sortedTransactions.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{t.counterparty?.trim() || '—'}</p>
                <p className="text-sm text-muted-foreground">{t.category}</p>
              </div>
              <span className="shrink-0 tabular-nums font-medium">{formatAmount(t)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
