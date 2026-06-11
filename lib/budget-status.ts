export type BudgetStatusLevel = 'below_floor' | 'under' | 'on_track' | 'slightly_over' | 'over'

const DEFAULT_ON_TRACK_THRESHOLD = 0.03
const DEFAULT_SLIGHTLY_OVER_THRESHOLD = 0.10

export function classifyBudgetStatus(
  gap: number,
  budget: number,
  opts?: { onTrackThreshold?: number; slightlyOverThreshold?: number }
): BudgetStatusLevel {
  const onTrack = opts?.onTrackThreshold ?? DEFAULT_ON_TRACK_THRESHOLD
  const slightlyOver = opts?.slightlyOverThreshold ?? DEFAULT_SLIGHTLY_OVER_THRESHOLD

  if (gap >= 0) return 'under'

  const absBudget = Math.abs(budget)
  if (absBudget === 0) return 'over'

  const overPercent = Math.abs(gap) / absBudget
  if (overPercent <= onTrack) return 'on_track'
  if (overPercent <= slightlyOver) return 'slightly_over'
  return 'over'
}

export const BUDGET_STATUS_CONFIG: Record<BudgetStatusLevel, {
  label: string
  labelShort: string
  borderClass: string
  textClass: string
  bgClass: string
  pillBgClass: string
}> = {
  // Spending below the sustainable floor: a nudge (you can afford more), not an alarm.
  below_floor: {
    label: 'Below Spending Floor',
    labelShort: 'Below Floor',
    borderClass: 'border-l-indigo-500',
    textClass: 'text-indigo-600',
    bgClass: 'bg-indigo-500/15',
    pillBgClass: 'bg-indigo-500/15',
  },
  under: {
    label: 'Under Budget',
    labelShort: 'Under',
    borderClass: 'border-l-green-500',
    textClass: 'text-green-600',
    bgClass: 'bg-green-500/15',
    pillBgClass: 'bg-green-500/15',
  },
  on_track: {
    label: 'On Track',
    labelShort: 'On Track',
    borderClass: 'border-l-blue-500',
    textClass: 'text-blue-600',
    bgClass: 'bg-blue-500/15',
    pillBgClass: 'bg-blue-500/15',
  },
  slightly_over: {
    label: 'Slightly Above',
    labelShort: 'Slightly Above',
    borderClass: 'border-l-amber-500',
    textClass: 'text-amber-600',
    bgClass: 'bg-amber-500/15',
    pillBgClass: 'bg-amber-500/15',
  },
  over: {
    label: 'Above Budget',
    labelShort: 'Above',
    borderClass: 'border-l-red-500',
    textClass: 'text-red-600',
    bgClass: 'bg-red-500/15',
    pillBgClass: 'bg-red-500/15',
  },
}

export function getBudgetStatusConfig(gap: number, budget: number) {
  const level = classifyBudgetStatus(gap, budget)
  return { level, ...BUDGET_STATUS_CONFIG[level] }
}

/**
 * Escalates an 'under' budget status to 'below_floor' when forecast spend is below
 * the sustainable spending floor — underspending vs your goal, not just your budget.
 */
export function refineBudgetStatusWithSpendRange(
  level: BudgetStatusLevel,
  spendRangePosition: 'below_floor' | 'in_range' | 'near_ceiling' | 'above_ceiling' | null | undefined
): BudgetStatusLevel {
  if (level === 'under' && spendRangePosition === 'below_floor') return 'below_floor'
  return level
}
