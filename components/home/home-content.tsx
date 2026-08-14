'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useDailySummary } from '@/lib/hooks/queries/use-daily-summary'
import { Skeleton } from '@/components/ui/skeleton'
import { computeGbpAvailable, latestAccountRows } from '@/lib/gbp-available'
import { isTrustAccount, TRUST_EXCLUSION_LABEL } from '@/lib/trust-exclusions'
import { isExpenseCategory } from '@/lib/category-filters'
import { AttentionList, type ForecastCategoryRow } from '@/components/home/attention-list'
import { cn } from '@/utils/cn'

/**
 * Home answers one question: is there anything I need to do?
 *
 * Four blocks in descending order of how often they change a decision, and
 * nothing duplicated from the other four pages. This replaces the Executive
 * Summary card — five cards inside a card, each scrolling to a section lower
 * on the same page, which was navigation dressed as content.
 */
export function HomeContent() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const { data: accounts, isLoading: accountsLoading } = useAccounts()
  const { data: summary, isLoading: summaryLoading } = useDailySummary()

  const gbp = useMemo(() => computeGbpAvailable(accounts ?? []), [accounts])

  const convertedCash = useMemo(() => {
    const rows = latestAccountRows(accounts ?? []).filter(
      (account) => account.category === 'Cash' && !isTrustAccount(account),
    )
    return rows.reduce(
      (sum, account) =>
        sum +
        convertAmount(Number(account.balance_total_local ?? 0), account.currency ?? 'USD', fxRate),
      0,
    )
  }, [accounts, convertAmount, fxRate])

  const budget = useMemo(() => {
    const rows = (summary?.forecastByCategory ?? []) as ForecastCategoryRow[]
    let forecast = 0
    let annualBudget = 0
    for (const row of rows) {
      if (!isExpenseCategory(row.category)) continue
      forecast += Math.abs(Number(row.forecast ?? 0))
      annualBudget += Math.abs(Number(row.annualBudget ?? 0))
    }
    if (annualBudget === 0) return null
    // Positive gap = tracking under budget.
    return { forecast, annualBudget, gap: annualBudget - forecast }
  }, [summary])

  const netWorth = useMemo(() => {
    const rows = latestAccountRows(accounts ?? []).filter((account) => !isTrustAccount(account))
    if (rows.length === 0) return null
    return rows.reduce(
      (sum, account) =>
        sum +
        convertAmount(Number(account.balance_total_local ?? 0), account.currency ?? 'USD', fxRate),
      0,
    )
  }, [accounts, convertAmount, fxRate])

  const gbpFormat = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const displayFormat = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  /** Summary figures arrive in GBP; restate them only when the toggle says USD. */
  const toDisplay = (gbpValue: number) =>
    currency === 'USD' ? convertAmount(gbpValue, 'GBP', fxRate) : gbpValue

  if (accountsLoading || summaryLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. GBP available — the binding operational constraint, and the largest
             type on the page. Deliberately does not follow the currency toggle. */}
      <section aria-labelledby="gbp-available-label">
        <p
          id="gbp-available-label"
          className="text-meta font-medium uppercase tracking-wide text-muted-foreground"
        >
          GBP available
        </p>
        <p className="figure type-display mt-1">{gbpFormat.format(gbp.total)}</p>
        <p className="text-meta text-muted-foreground mt-1">
          Sterling cash held, not converted{gbp.asOf ? ` · As of ${gbp.asOf}` : ''}
        </p>
        <p className="text-meta text-muted-foreground">
          <span className="num">{displayFormat.format(convertedCash)}</span> all cash converted to{' '}
          {currency}
        </p>
      </section>

      {/* 2. Budget status. The headline figure is the forecast — what the year
             is tracking towards — so it is labelled as such. Under "Budget" it
             read as the budget itself, which is the £205k comparator below. */}
      <section aria-labelledby="budget-status-label" className="border-t pt-4">
        <p
          id="budget-status-label"
          className="text-meta font-medium uppercase tracking-wide text-muted-foreground"
        >
          Tracking spend
        </p>
        {budget ? (
          <>
            <p className="figure text-figure mt-1">{displayFormat.format(toDisplay(budget.forecast))}</p>
            <p
              className={cn(
                'num text-body font-medium',
                budget.gap >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {budget.gap >= 0 ? 'Under' : 'Over'} budget by{' '}
              {displayFormat.format(Math.abs(toDisplay(budget.gap)))}
            </p>
            <p className="text-meta text-muted-foreground">
              Against a{' '}
              <span className="num">{displayFormat.format(toDisplay(budget.annualBudget))}</span>{' '}
              budget for the year ·{' '}
              <Link href="/spending#budget-table" className="underline underline-offset-4">
                Spending
              </Link>
            </p>
          </>
        ) : (
          <p className="text-body text-muted-foreground mt-1">No budget set.</p>
        )}
      </section>

      {/* 3. Net worth */}
      <section aria-labelledby="net-worth-label" className="border-t pt-4">
        <p
          id="net-worth-label"
          className="text-meta font-medium uppercase tracking-wide text-muted-foreground"
        >
          Net worth
        </p>
        {netWorth !== null ? (
          <>
            <p className="figure text-figure mt-1">{displayFormat.format(netWorth)}</p>
            <p className="text-meta text-muted-foreground">
              {TRUST_EXCLUSION_LABEL} ·{' '}
              <Link href="/position#net-worth-chart" className="underline underline-offset-4">
                Position
              </Link>
            </p>
          </>
        ) : (
          <p className="text-body text-muted-foreground mt-1">No accounts yet.</p>
        )}
      </section>

      {/* 4. Attention — 0-3 items, and only when genuinely actionable. */}
      <section aria-labelledby="attention-label" className="border-t pt-4">
        <p
          id="attention-label"
          className="text-meta font-medium uppercase tracking-wide text-muted-foreground"
        >
          Attention
        </p>
        <AttentionList
          lastSyncAt={summary?.lastSyncDate ?? null}
          forecastByCategory={(summary?.forecastByCategory ?? []) as ForecastCategoryRow[]}
        />
      </section>
    </div>
  )
}
