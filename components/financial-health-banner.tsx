'use client'

import { cn } from '@/utils/cn'
import { Shield, TrendingUp, Wallet, Target, Scale } from 'lucide-react'
import { classifyBudgetStatus, type BudgetStatusLevel } from '@/lib/budget-status'
import type { SpendRangePosition } from '@/lib/sustainable-spend'

export type SustainableSpendSummary = {
  floorAnnual: number
  ceilingAnnual: number
  currentForecastSpend: number
  position: SpendRangePosition
}

export type FinancialHealthData = {
  netWorth: number | null
  netWorthVsLastYear: number | null
  netWorthVsLastYearPercent: number | null
  cashRunwayMonths: number | null
  budgetGap: number | null
  budgetTotal: number | null
  currencySymbol: string
  sustainableSpend?: SustainableSpendSummary | null
}

type HealthLevel = 'strong' | 'good' | 'watch'
type HealthResult = { level: HealthLevel; concernAreas: string[] }

function classifyHealth(data: FinancialHealthData): HealthResult {
  const { netWorthVsLastYear, cashRunwayMonths, budgetGap, budgetTotal, sustainableSpend } = data

  const concernAreas: string[] = []
  const netWorthGrowing = netWorthVsLastYear != null && netWorthVsLastYear > 0
  const runwayOk = cashRunwayMonths != null && cashRunwayMonths > 6
  const budgetStatus: BudgetStatusLevel | null =
    budgetGap != null && budgetTotal != null
      ? classifyBudgetStatus(budgetGap, budgetTotal)
      : null
  const budgetOk = budgetStatus === 'under' || budgetStatus === 'on_track'

  if (!netWorthGrowing && netWorthVsLastYear != null) concernAreas.push('net worth')
  if (!runwayOk && cashRunwayMonths != null) concernAreas.push('cash runway')
  if (!budgetOk && budgetStatus != null) concernAreas.push('budget')
  // Only overspending vs the sustainable ceiling is a concern; below-floor is a nudge, not an alarm.
  if (sustainableSpend?.position === 'above_ceiling') concernAreas.push('sustainable spending')

  const level: HealthLevel =
    concernAreas.length === 0 ? 'strong' : concernAreas.length === 1 ? 'good' : 'watch'
  return { level, concernAreas }
}

function formatCompact(value: number, symbol: string) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
  return `${symbol}${Math.round(value)}`
}

const HEALTH_CONFIG: Record<HealthLevel, {
  border: string
  bg: string
  iconBg: string
  iconColor: string
}> = {
  strong: {
    border: 'border-l-blue-500',
    bg: 'bg-gradient-to-r from-blue-500/8 via-blue-500/4 to-transparent',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-600',
  },
  good: {
    border: 'border-l-blue-500',
    bg: 'bg-gradient-to-r from-blue-500/6 via-blue-500/3 to-transparent',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-600',
  },
  watch: {
    border: 'border-l-amber-500',
    bg: 'bg-gradient-to-r from-amber-500/6 via-amber-500/3 to-transparent',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-600',
  },
}

export function FinancialHealthBanner({ data }: { data: FinancialHealthData }) {
  const { level: health, concernAreas } = classifyHealth(data)
  const config = HEALTH_CONFIG[health]
  const { currencySymbol: sym } = data

  const bullets: { icon: typeof TrendingUp; text: string; muted?: boolean }[] = []

  if (data.netWorthVsLastYear != null && data.netWorthVsLastYearPercent != null) {
    const dir = data.netWorthVsLastYear >= 0 ? 'up' : 'down'
    const pct = Math.abs(data.netWorthVsLastYearPercent).toFixed(1)
    bullets.push({
      icon: TrendingUp,
      text: `Net worth is ${dir} ${formatCompact(Math.abs(data.netWorthVsLastYear), sym)} (${pct}%) vs last year-end`,
    })
  }

  if (data.cashRunwayMonths != null && isFinite(data.cashRunwayMonths)) {
    const months = data.cashRunwayMonths.toFixed(1)
    bullets.push({
      icon: Wallet,
      text: `${months} months of cash runway`,
    })
  }

  if (data.budgetGap != null && data.budgetTotal != null) {
    const status = classifyBudgetStatus(data.budgetGap, data.budgetTotal)
    const label =
      status === 'under'
        ? `${formatCompact(Math.abs(data.budgetGap), sym)} under budget`
        : status === 'on_track'
          ? 'Spending is on track with budget'
          : status === 'slightly_over'
            ? `Slightly above budget by ${formatCompact(Math.abs(data.budgetGap), sym)}`
            : `${formatCompact(Math.abs(data.budgetGap), sym)} above budget`
    bullets.push({ icon: Target, text: label })
  }

  if (data.sustainableSpend) {
    const ss = data.sustainableSpend
    const text =
      ss.position === 'below_floor'
        ? `Spending ${formatCompact(ss.floorAnnual - ss.currentForecastSpend, sym)} below your sustainable floor — you can afford more`
        : ss.position === 'in_range'
          ? `Spending within your sustainable range (${formatCompact(ss.floorAnnual, sym)}–${formatCompact(ss.ceilingAnnual, sym)})`
          : ss.position === 'near_ceiling'
            ? `Spending is near your sustainable ceiling of ${formatCompact(ss.ceilingAnnual, sym)}`
            : `Spending ${formatCompact(ss.currentForecastSpend - ss.ceilingAnnual, sym)} above your sustainable ceiling`
    bullets.push({ icon: Scale, text })
  }

  if (bullets.length === 0) return null

  const headline =
    health === 'strong'
      ? 'Your finances are in good shape'
      : health === 'good'
        ? `Overall solid — ${concernAreas[0]} is worth watching`
        : `A few areas to keep an eye on: ${concernAreas.join(' and ')}`

  return (
    <div
      className={cn(
        'rounded-xl border border-l-[3px] px-4 py-3.5',
        config.border,
        config.bg
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5', config.iconBg)}>
          <Shield className={cn('h-4.5 w-4.5', config.iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{headline}</p>
          <ul className="mt-1.5 space-y-0.5">
            {bullets.map((b, i) => {
              const Icon = b.icon
              return (
                <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{b.text}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
