'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { TodayTransactions } from './today-transactions'
import { TodaySpendByCategoryChart } from './today-spend-by-category-chart'
import { TodaySpendByMethodologyChart } from './today-spend-by-methodology-chart'
import { TodayHeroSummary } from './today-hero-summary'
import type { TodayPageData, TodayTransactionRow } from '@/lib/today-types'
import { useCurrency } from '@/lib/contexts/currency-context'

type TodayPageContentProps = {
  data: TodayPageData | null
}

type TransactionDialogFilter =
  | { type: 'category'; value: string }
  | { type: 'methodology'; value: string }
  | null

function formatTransactionAmount(
  t: TodayTransactionRow,
  currency: 'GBP' | 'USD',
  fxRate: number
): string {
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

export function TodayPageContent({ data }: TodayPageContentProps) {
  const [transactionDialog, setTransactionDialog] = useState<TransactionDialogFilter>(null)
  const { currency, fxRate } = useCurrency()

  const filteredTransactions = useMemo(() => {
    if (data == null || transactionDialog == null) return []
    if (transactionDialog.type === 'category') {
      return data.transactions.filter((t) => t.category === transactionDialog.value)
    }
    const categories = data.categoriesByMethodology[transactionDialog.value] ?? []
    const set = new Set(categories)
    return data.transactions.filter((t) => set.has(t.category))
  }, [data, transactionDialog])

  const dialogTitle =
    transactionDialog == null
      ? ''
      : transactionDialog.type === 'category'
        ? `Transactions: ${transactionDialog.value}`
        : `Transactions (${transactionDialog.value})`

  const dialogDescription =
    transactionDialog?.type === 'methodology'
      ? `Transactions for categories using ${transactionDialog.value} methodology.`
      : undefined

  if (data === null) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="space-y-3">
          <div className="rounded-xl border bg-card px-4 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-10 w-32" />
          </div>
          <div className="rounded-xl border bg-card px-4 py-4">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-3 h-3 w-full rounded-full" />
            <Skeleton className="mt-3 h-3 w-full rounded-full" />
          </div>
          <div className="rounded-xl border bg-card px-4 py-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-2 h-5 w-full" />
            <Skeleton className="mt-1 h-5 w-full" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[260px] w-full md:h-[320px]" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[260px] w-full md:h-[320px]" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <TodayHeroSummary
        totalSpentToday={data.totalSpentToday}
        spendByMethodology={data.spendByMethodology}
        headroomByMethodology={data.headroomByMethodology}
        impliedForecastChange={data.impliedForecastChange}
        totalForecastAtCurrentYtd={data.totalForecastAtCurrentYtd}
        totalForecastTomorrowAtZero={data.totalForecastTomorrowAtZero}
        gapToBudgetCurrent={data.gapToBudgetCurrent}
        gapToBudgetIfNoMoreSpend={data.gapToBudgetIfNoMoreSpend}
        gapToBudgetYesterday={data.gapToBudgetYesterday}
        onMethodologyClick={(methodology) => setTransactionDialog({ type: 'methodology', value: methodology })}
      />
      <TodaySpendByMethodologyChart
        spendByMethodology={data.spendByMethodology}
        headroomByMethodology={data.headroomByMethodology}
        budgetSumByMethodology={data.budgetSumByMethodology}
        impliedForecastChange={data.impliedForecastChange}
        totalForecastToday={data.totalForecastToday}
        totalForecastTomorrowAtZero={data.totalForecastTomorrowAtZero}
        onBarClick={(methodology) => setTransactionDialog({ type: 'methodology', value: methodology })}
      />
      <TodaySpendByCategoryChart
        spendByCategory={data.spendByCategory}
        onBarClick={(category) => setTransactionDialog({ type: 'category', value: category })}
      />
      <TodayTransactions transactions={data.transactions} />
      <Dialog open={transactionDialog != null} onOpenChange={(open) => !open && setTransactionDialog(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {dialogDescription != null && (
              <DialogDescription>{dialogDescription}</DialogDescription>
            )}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
            {filteredTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No transactions.</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...filteredTransactions]
                  .sort((a, b) => {
                    const amtA = a.amount_gbp ?? a.amount_usd ?? 0
                    const amtB = b.amount_gbp ?? b.amount_usd ?? 0
                    return amtA - amtB
                  })
                  .map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{t.counterparty?.trim() || '—'}</p>
                        <p className="text-sm text-muted-foreground">{t.category}</p>
                      </div>
                      <span className="shrink-0 tabular-nums font-medium">
                        {formatTransactionAmount(t, currency, fxRate ?? 1)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
