'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SustainableSpendInputsData } from '@/lib/hooks/use-sustainable-spend'
import { RETURN_ASSUMPTIONS_BY_PROFILE } from '@/lib/return-assumptions'
import type { SustainableSpendResult } from '@/lib/sustainable-spend'
import { cn } from '@/utils/cn'
import { AlertTriangle, ArrowDown, ArrowUp, Percent } from 'lucide-react'
import type { DraftAssumptions } from './spend-explorer'

interface MethodologyCardsProps {
  inputs: SustainableSpendInputsData
  result: SustainableSpendResult
  draft: DraftAssumptions
  symbol: string
}

function StepBadge({ step }: { step: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-600">
      {step}
    </span>
  )
}

function FormulaRow({
  label,
  detail,
  value,
  operator,
  emphasis,
  valueClass,
}: {
  label: string
  detail?: string
  value: string
  operator?: '+' | '−' | '='
  emphasis?: boolean
  valueClass?: string
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 py-1.5',
        emphasis && 'border-t mt-1 pt-2.5'
      )}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span
          className={cn(
            'w-3 shrink-0 text-center font-semibold tabular-nums',
            operator === '−' ? 'text-red-600' : operator === '+' ? 'text-green-600' : 'text-muted-foreground'
          )}
        >
          {operator ?? ''}
        </span>
        <div className="min-w-0">
          <span className={cn('text-sm', emphasis && 'font-semibold')}>{label}</span>
          {detail && <p className="text-[11px] text-muted-foreground">{detail}</p>}
        </div>
      </div>
      <span
        className={cn(
          'tabular-nums text-sm shrink-0',
          emphasis ? 'font-bold text-base' : 'font-medium',
          valueClass
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function MethodologyCards({ inputs, result, draft, symbol }: MethodologyCardsProps) {
  const formatCurrency = (value: number) => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(value)}`
  }
  const formatPct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`

  const profile = RETURN_ASSUMPTIONS_BY_PROFILE[draft.returnProfile]

  // Group the per-account asset mix into categories for the breakdown table
  const { categories, totalAssets, weightedNominal } = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const entry of inputs.assetMix) {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.balance)
    }
    const total = Array.from(byCategory.values()).reduce((sum, b) => sum + b, 0)
    const rows = Array.from(byCategory.entries())
      .map(([category, balance]) => ({
        category,
        balance,
        weight: total > 0 ? balance / total : 0,
        nominal: profile.nominalReturns[category] ?? profile.defaultNominalReturn,
      }))
      .sort((a, b) => b.balance - a.balance)
    const nominal = rows.reduce((sum, r) => sum + r.weight * r.nominal, 0)
    return { categories: rows, totalAssets: total, weightedNominal: nominal }
  }, [inputs.assetMix, profile])

  const inflows = Math.max(0, inputs.annualIncome) + Math.max(0, inputs.annualGiftMoney)
  const returnsContribution = Math.max(0, inputs.netWorth * result.realReturn)
  const rawFloor = inflows - result.requiredAnnualSavings

  const runwayLabel =
    inputs.cashRunwayMonths == null
      ? null
      : Number.isFinite(inputs.cashRunwayMonths)
        ? `${inputs.cashRunwayMonths.toFixed(1)} months`
        : 'unlimited'

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Step 1: real return */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <StepBadge step={1} />
            <Percent className="h-4 w-4 text-muted-foreground" />
            Real return on your assets
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Each asset category is assigned a {draft.returnProfile.toLowerCase()} nominal return,
            weighted by balance, then adjusted for {formatPct(draft.inflationRate)} inflation.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            {categories.map((row) => (
              <div key={row.category} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 truncate text-muted-foreground">{row.category}</span>
                <div className="relative h-3 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-indigo-500/60 transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(1, row.weight * 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
                  {formatPct(row.weight, 0)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-xs font-medium">
                  {formatPct(row.nominal)} <span className="text-muted-foreground font-normal">nom</span>
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Weighted nominal return on {formatCurrency(totalAssets)} of assets
              </span>
              <span className="tabular-nums font-medium">{formatPct(weightedNominal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inflation adjustment</span>
              <span className="tabular-nums font-medium text-red-600">
                −{formatPct(draft.inflationRate)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="font-semibold">Real return</span>
              <span
                className={cn(
                  'tabular-nums font-bold',
                  result.realReturn >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {result.realReturn >= 0 ? '+' : ''}
                {formatPct(result.realReturn)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: ceiling */}
      <Card className="border-l-[3px] border-l-red-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <StepBadge step={2} />
            <ArrowUp className="h-4 w-4 text-red-600" />
            Ceiling — preserve real net worth
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The most you can spend in a year while your net worth keeps pace with inflation:
            inflows plus the real return your assets generate.
          </p>
        </CardHeader>
        <CardContent>
          <FormulaRow label="Annual income" value={formatCurrency(inputs.annualIncome)} operator="+" />
          <FormulaRow label="Gift money" value={formatCurrency(inputs.annualGiftMoney)} operator="+" />
          <FormulaRow
            label="Real return on net worth"
            detail={`${formatCurrency(inputs.netWorth)} net worth × ${formatPct(result.realReturn)} real return${
              inputs.netWorth * result.realReturn < 0 ? ' (negative returns count as zero)' : ''
            }`}
            value={formatCurrency(returnsContribution)}
            operator="+"
          />
          <FormulaRow
            label={result.liquidityConstrained ? 'Uncapped ceiling' : 'Ceiling'}
            value={formatCurrency(result.uncappedCeilingAnnual)}
            operator="="
            emphasis
            valueClass={result.liquidityConstrained ? 'line-through text-muted-foreground' : 'text-red-600'}
          />
          {result.liquidityConstrained && (
            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Liquidity cap applied
              </p>
              <p className="text-muted-foreground">
                Your cash runway ({runwayLabel ?? 'unknown'}) is below your{' '}
                {draft.emergencyFundMonths}-month emergency fund target, so the ceiling is capped at
                income + gifts until the buffer is rebuilt.
              </p>
              <p className="font-semibold tabular-nums text-foreground">
                Capped ceiling = {formatCurrency(result.ceilingAnnual)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: floor */}
      <Card className="border-l-[3px] border-l-indigo-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <StepBadge step={3} />
            <ArrowDown className="h-4 w-4 text-indigo-600" />
            Floor — fund your savings goal
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {draft.floorMode === 'savings_rate'
              ? 'What is left of your inflows after setting aside your target savings rate. Spending below this means out-saving your goal.'
              : 'What is left of your inflows after the savings needed to hit your wealth target on time. Spending below this means out-saving your goal.'}
          </p>
        </CardHeader>
        <CardContent>
          <FormulaRow
            label="Annual inflows"
            detail="Income + gift money"
            value={formatCurrency(inflows)}
            operator="+"
          />
          <FormulaRow
            label={
              result.requiredAnnualSavings < 0 ? 'Wealth-target headroom' : 'Required savings'
            }
            detail={
              draft.floorMode === 'savings_rate'
                ? `${formatPct(draft.targetSavingsRate, 0)} of ${formatCurrency(inputs.annualIncome)} income`
                : draft.wealthTarget != null
                  ? result.requiredAnnualSavings > 0
                    ? `To reach ${formatCurrency(draft.wealthTarget)} in ${draft.horizonYears} years at ${formatPct(result.realReturn)} real return`
                    : result.requiredAnnualSavings < 0
                      ? `Returns alone reach ${formatCurrency(draft.wealthTarget)} — you can spend this much above inflows and still hit your target`
                      : `Your wealth target of ${formatCurrency(draft.wealthTarget)} is already on track at current returns`
                  : 'No wealth target set — set one in the panel'
            }
            value={formatCurrency(
              result.requiredAnnualSavings < 0
                ? Math.abs(result.requiredAnnualSavings)
                : result.requiredAnnualSavings
            )}
            operator={result.requiredAnnualSavings < 0 ? '+' : '−'}
          />
          <FormulaRow
            label={result.floorClampedToCommitted ? 'Goal-derived floor' : 'Floor'}
            value={formatCurrency(Math.max(0, rawFloor))}
            operator="="
            emphasis
            valueClass={
              result.floorClampedToCommitted ? 'line-through text-muted-foreground' : 'text-indigo-600'
            }
          />
          {result.floorClampedToCommitted && (
            <div className="mt-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 p-3 text-xs space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold text-indigo-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Raised to committed spend
              </p>
              <p className="text-muted-foreground">
                Your recurring commitments total {formatCurrency(inputs.committedAnnualSpend)} per
                year — more than the goal-derived floor — so the floor is raised to cover them.
              </p>
              <p className="font-semibold tabular-nums text-foreground">
                Floor = {formatCurrency(result.floorAnnual)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
