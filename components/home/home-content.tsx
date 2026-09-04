'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useDailySummary } from '@/lib/hooks/queries/use-daily-summary'
import { useGbpLedger } from '@/lib/hooks/queries/use-gbp-ledger'
import { Card, CardContent } from '@/components/ui/card'
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
 * nothing duplicated from the other four pages.
 *
 * The shape is deliberate. GBP available is the binding constraint, so it gets
 * the hero — the editorial face at display size, alone on its plane. The two
 * standing figures beneath it sit side by side because they are read as a pair,
 * not a sequence. Previously all four were the same stack of label-and-number
 * separated by hairlines, which gave the page no centre and left two thirds of
 * a desktop screen empty.
 *
 * The hero figure is rolled forward off the account snapshot by the sterling
 * ledger booked since it, so it tracks the month rather than freezing on the day
 * the balances were last typed in. The two figures beneath it are still read
 * straight off the snapshot: they answer questions about position, where a
 * balance-date figure is the honest one, and rolling them forward would need
 * dollar flows this ledger cannot attribute to an account.
 */
export function HomeContent() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const { data: accounts, isLoading: accountsLoading } = useAccounts()
  const { data: summary, isLoading: summaryLoading } = useDailySummary()

  /**
   * Two passes: the first establishes the snapshot date so the ledger query
   * knows how far back to reach, the second folds that ledger in. Both are
   * memoized reductions over a handful of account rows, so the repeat costs
   * nothing worth avoiding, and the alternative — a second exported function
   * duplicating the contributing-account filter — is how the two drift apart.
   */
  const balancesOnly = useMemo(() => computeGbpAvailable(accounts ?? []), [accounts])
  const { data: gbpLedger, isLoading: gbpLedgerLoading } = useGbpLedger(balancesOnly.balancesAsOf)
  const gbp = useMemo(
    () => computeGbpAvailable(accounts ?? [], gbpLedger ?? []),
    [accounts, gbpLedger],
  )

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

  if (accountsLoading || summaryLoading || gbpLedgerLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-44 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    )
  }

  const overBudget = budget ? budget.gap < 0 : false
  /**
   * Only claim a roll-forward when it moves the figure by a whole pound. The
   * card rounds to the pound, so a sub-£1 net would otherwise render as "less
   * £0 booked since" against an unchanged total.
   */
  const rolledForward = Math.round(gbp.sinceBalances) !== 0
  /**
   * The meter spans whichever is larger, the forecast or the budget, so the
   * overshoot has somewhere to be drawn. A bar that simply clamps at 100% turns
   * every over-budget year into the same full red rectangle — it reports that
   * you are over, which the sentence underneath already said, and hides by how
   * much. Here the coloured tail *is* the overshoot, to scale.
   */
  const budgetSpan = budget ? Math.max(budget.forecast, budget.annualBudget) : 0
  const budgetShare = budget && budgetSpan > 0 ? budget.annualBudget / budgetSpan : 0
  const forecastShare = budget && budgetSpan > 0 ? budget.forecast / budgetSpan : 0

  return (
    /* Capped and centred. Home carries four blocks; letting them run the full
       width of a 27" display stretches a three-word label across 2000px and
       leaves the page looking emptier the bigger the screen gets. */
    <div className="mx-auto w-full max-w-5xl space-y-4 animate-rise-in">
      {/* 1. GBP available — the binding operational constraint, and the largest
             type on the page. Deliberately does not follow the currency toggle. */}
      <Card variant="raised" aria-labelledby="gbp-available-label">
        <CardContent className="flex flex-col gap-6 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div className="min-w-0">
            <p id="gbp-available-label" className="eyebrow">
              GBP available
            </p>
            <p className="editorial type-display mt-2 text-foreground">
              {gbpFormat.format(gbp.total)}
            </p>
            <p className="mt-2 text-body text-muted-foreground">
              Sterling cash held, not converted
            </p>
            {/* Where the figure came from, and over what window. Naming the
                snapshot and the movement separately is the difference between a
                number the reader can check against their bank and one they have
                to take on trust — and it makes an unusually large swing legible
                as a big month rather than as a bug. The closing date is the last
                row the ledger actually carries, not today: a quiet ledger and a
                quiet month look identical from here, and only one of them means
                the figure is current. */}
            {gbp.balancesAsOf ? (
              <p className="mt-1 text-meta text-muted-foreground">
                {rolledForward ? (
                  <>
                    <span className="num">{gbpFormat.format(gbp.balances)}</span> at{' '}
                    <span className="num">{gbp.balancesAsOf}</span>,{' '}
                    {gbp.sinceBalances < 0 ? 'less' : 'plus'}{' '}
                    <span className="num">
                      {gbpFormat.format(Math.abs(gbp.sinceBalances))}
                    </span>{' '}
                    booked to <span className="num">{gbp.asOf}</span>
                  </>
                ) : (
                  <>
                    As of <span className="num">{gbp.balancesAsOf}</span>, with nothing booked
                    since
                  </>
                )}
              </p>
            ) : null}
          </div>

          {/* The comparator, set apart rather than stacked underneath: it is a
              different question ("what if I converted everything"), not a
              footnote to the figure above. */}
          <div className="shrink-0 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <p className="eyebrow">All cash in {currency}</p>
            <p className="figure mt-1.5 text-figure text-foreground">
              {displayFormat.format(convertedCash)}
            </p>
            <p className="mt-1 text-meta text-muted-foreground">If everything were converted</p>
          </div>
        </CardContent>
      </Card>

      {/* 2 + 3. The two standing figures, read as a pair. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Budget status. The headline figure is the forecast — what the year is
            tracking towards — so it is labelled as such. */}
        <Card aria-labelledby="budget-status-label">
          <CardContent className="flex h-full flex-col p-5">
            <p id="budget-status-label" className="eyebrow">
              Tracking spend
            </p>
            {budget ? (
              <>
                <p className="figure mt-1.5 text-figure text-foreground">
                  {displayFormat.format(toDisplay(budget.forecast))}
                </p>

                {/* Forecast against the annual budget. The fastest read of "how
                    much of the year's allowance is spoken for" — a sentence
                    that previously had to be reconstructed from two separate
                    currency figures.

                    Under budget: a neutral fill inside the track, the gap being
                    headroom. Over: the fill runs to the budget mark and a red
                    tail carries on past it, with a tick showing where the
                    budget sat. */}
                <span
                  className="meter relative mt-3 h-1.5 w-full"
                  role="img"
                  aria-label={`Forecast is ${Math.round((budget.forecast / budget.annualBudget) * 100)}% of the annual budget`}
                >
                  <span
                    className="meter-fill absolute inset-y-0 left-0"
                    style={{ width: `${(overBudget ? budgetShare : forecastShare) * 100}%` }}
                  />
                  {overBudget && (
                    <span
                      className="absolute inset-y-0 rounded-r-full bg-negative"
                      style={{
                        left: `${budgetShare * 100}%`,
                        width: `${(forecastShare - budgetShare) * 100}%`,
                      }}
                    />
                  )}
                </span>
                {overBudget && (
                  <p className="mt-1.5 flex items-center justify-between text-meta text-muted-foreground">
                    <span>Budget</span>
                    <span className="text-negative">Overshoot</span>
                  </p>
                )}

                <p
                  className={cn(
                    'num mt-2.5 text-body font-semibold',
                    overBudget ? 'text-negative' : 'text-positive',
                  )}
                >
                  {overBudget ? 'Over' : 'Under'} budget by{' '}
                  {displayFormat.format(Math.abs(toDisplay(budget.gap)))}
                </p>
                <p className="mt-1 text-meta text-muted-foreground">
                  Against a{' '}
                  <span className="num">{displayFormat.format(toDisplay(budget.annualBudget))}</span>{' '}
                  budget for the year
                </p>

                <DrillIn href="/spending#budget-table" className="mt-auto pt-3">
                  Spending
                </DrillIn>
              </>
            ) : (
              <p className="mt-1.5 text-body text-muted-foreground">No budget set.</p>
            )}
          </CardContent>
        </Card>

        {/* Net worth */}
        <Card aria-labelledby="net-worth-label">
          <CardContent className="flex h-full flex-col p-5">
            <p id="net-worth-label" className="eyebrow">
              Net worth
            </p>
            {netWorth !== null ? (
              <>
                <p className="figure mt-1.5 text-figure text-foreground">
                  {displayFormat.format(netWorth)}
                </p>
                <p className="mt-2.5 text-meta text-muted-foreground">{TRUST_EXCLUSION_LABEL}</p>
                <DrillIn href="/position#net-worth-chart" className="mt-auto pt-3">
                  Position
                </DrillIn>
              </>
            ) : (
              <p className="mt-1.5 text-body text-muted-foreground">No accounts yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Attention — 0-3 items, and only when genuinely actionable. */}
      <Card aria-labelledby="attention-label">
        <CardContent className="p-5">
          <p id="attention-label" className="eyebrow">
            Attention
          </p>
          <AttentionList
            lastSyncAt={summary?.lastSyncDate ?? null}
            forecastByCategory={(summary?.forecastByCategory ?? []) as ForecastCategoryRow[]}
          />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * The "go and look at this properly" link. One shape for all of them, sitting
 * at the foot of its card, so a drill-in never gets mistaken for part of the
 * sentence above it — which is what the old inline underlined links did.
 */
function DrillIn({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Link
        href={href}
        className="group inline-flex items-center gap-1 text-meta font-semibold text-primary transition-colors hover:text-foreground"
      >
        {children}
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </Link>
    </div>
  )
}
