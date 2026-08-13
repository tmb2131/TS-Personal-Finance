import type { ReturnProfile, SpendingFloorMode, WealthTargetTerms } from '@/lib/types'
import {
  weightedNominalReturn,
  weightedAfterTaxRealReturn,
  type AssetMixEntry,
  type ReturnAssumptions,
} from '@/lib/return-assumptions'

export type SpendRangePosition = 'below_floor' | 'in_range' | 'near_ceiling' | 'above_ceiling'

/** Spend at or above this fraction of the ceiling counts as "near ceiling". */
const NEAR_CEILING_FRACTION = 0.9

export interface SustainableSpendAssumptions {
  returnProfile: ReturnProfile
  returnAssumptions: ReturnAssumptions
  inflationRate: number
  floorMode: SpendingFloorMode
  targetSavingsRate: number
  /** Target net worth at the horizon; interpret using `wealthTargetTerms`. */
  wealthTarget: number | null
  /** real = today's purchasing power at horizon; nominal = future account value */
  wealthTargetTerms: WealthTargetTerms
  horizonYears: number
  emergencyFundMonths: number
}

export interface SustainableSpendInput {
  /** Assets minus debt, display currency. */
  netWorth: number
  /** Positive balances by account category, used to weight return assumptions. */
  assetMix: AssetMixEntry[]
  annualIncome: number
  annualGiftMoney: number
  /** Forecast annual expenses (positive). */
  annualForecastSpend: number
  /** Annualized recurring commitments (positive). Acts as a lower clamp on the floor. */
  committedAnnualSpend?: number | null
  cashRunwayMonths?: number | null
  assumptions: SustainableSpendAssumptions
}

export interface SustainableSpendResult {
  floorAnnual: number
  ceilingAnnual: number
  /** Ceiling before any liquidity cap was applied. */
  uncappedCeilingAnnual: number
  currentForecastSpend: number
  position: SpendRangePosition
  /** Weighted real return used for the ceiling and wealth-target math. */
  realReturn: number
  requiredAnnualSavings: number
  /** True when cash runway is below the emergency fund target, capping the ceiling at income + gifts. */
  liquidityConstrained: boolean
  /** True when the goal-derived floor fell below committed recurring spend and was raised to it. */
  floorClampedToCommitted: boolean
  /**
   * True when committed spending exceeds sustainable spending. Previously impossible
   * because the floor was clamped down to the ceiling, which hid the state entirely.
   */
  floorExceedsCeiling: boolean
  drivers: { floor: string; ceiling: string }
}

/**
 * Annual savings needed to grow `netWorth` to `wealthTarget` over `horizonYears`
 * at growth rate `r` (real or nominal, matching the wealth target denomination).
 */
function requiredSavingsForWealthTarget(
  netWorth: number,
  wealthTarget: number,
  horizonYears: number,
  growthRate: number
): number {
  const n = Math.max(1, horizonYears)
  const r = growthRate
  const grownNetWorth = netWorth * Math.pow(1 + r, n)
  const gap = wealthTarget - grownNetWorth
  if (Math.abs(r) < 1e-9) return gap / n
  const annuityFactor = (Math.pow(1 + r, n) - 1) / r
  return gap / annuityFactor
}

export function computeSustainableSpendRange(input: SustainableSpendInput): SustainableSpendResult {
  const {
    netWorth,
    assetMix,
    annualIncome,
    annualGiftMoney,
    annualForecastSpend,
    committedAnnualSpend,
    cashRunwayMonths,
    assumptions,
  } = input

  const profile = assumptions.returnAssumptions
  const nominalReturn = weightedNominalReturn(assetMix, profile)
  // After tax: the ceiling is a spending question, and you cannot spend the
  // Revenue's share. Gains are taxed; losses are not grossed up.
  const realReturn = weightedAfterTaxRealReturn(assetMix, profile, assumptions.inflationRate)
  const wealthTargetGrowthRate =
    assumptions.wealthTargetTerms === 'nominal' ? nominalReturn : realReturn

  const inflows = Math.max(0, annualIncome) + Math.max(0, annualGiftMoney)

  // Ceiling: spend level at which real net worth is preserved.
  // No clamp on the return term. When the real after-tax return is negative the
  // ceiling is genuinely below inflows, because sustaining spend at that level
  // erodes capital. Flooring it at zero reported a ceiling that could never fall.
  const uncappedCeilingAnnual = inflows + netWorth * realReturn
  const liquidityConstrained =
    cashRunwayMonths != null &&
    Number.isFinite(cashRunwayMonths) &&
    cashRunwayMonths < assumptions.emergencyFundMonths
  const ceilingAnnual = liquidityConstrained ? inflows : uncappedCeilingAnnual

  // Floor: inflows minus the savings required by the user's goal.
  const useWealthTarget =
    assumptions.floorMode === 'wealth_target' &&
    assumptions.wealthTarget != null &&
    assumptions.wealthTarget > 0
  const requiredAnnualSavings = useWealthTarget
    ? requiredSavingsForWealthTarget(
        netWorth,
        assumptions.wealthTarget as number,
        assumptions.horizonYears,
        wealthTargetGrowthRate
      )
    : Math.max(0, annualIncome) * assumptions.targetSavingsRate

  const rawFloor = inflows - requiredAnnualSavings
  const committed = Math.max(0, committedAnnualSpend ?? 0)
  const floorClampedToCommitted = committed > rawFloor
  // The floor is no longer clamped down to the ceiling. Committed spending above
  // sustainable spending is a real and important state, and must surface rather
  // than be silently collapsed into a zero-width range.
  const floorAnnual = Math.max(0, Math.max(rawFloor, committed))
  const floorExceedsCeiling = floorAnnual > ceilingAnnual

  const spend = Math.max(0, annualForecastSpend)
  let position: SpendRangePosition
  if (spend > ceilingAnnual) {
    position = 'above_ceiling'
  } else if (ceilingAnnual > 0 && spend >= ceilingAnnual * NEAR_CEILING_FRACTION) {
    position = 'near_ceiling'
  } else if (spend < floorAnnual) {
    position = 'below_floor'
  } else {
    position = 'in_range'
  }

  const floorDriver = floorClampedToCommitted
    ? 'Floor raised to your committed recurring spend'
    : useWealthTarget
      ? requiredAnnualSavings > 0
        ? `Floor driven by your wealth target over ${assumptions.horizonYears} years`
        : requiredAnnualSavings < 0
          ? 'Returns alone reach your wealth target — you can spend above inflows and still stay on track'
          : 'Your wealth target is already on track at current returns, so no extra savings are required'
      : `Floor driven by your ${Math.round(assumptions.targetSavingsRate * 100)}% target savings rate`
  const ceilingDriver = liquidityConstrained
    ? `Ceiling capped at income + gifts while cash runway is under your ${assumptions.emergencyFundMonths}-month target`
    : `Ceiling = income + gifts ${realReturn < 0 ? '−' : '+'} ${Math.abs(realReturn * 100).toFixed(1)}% real after-tax return on net worth`

  return {
    floorAnnual,
    ceilingAnnual,
    uncappedCeilingAnnual,
    currentForecastSpend: spend,
    position,
    realReturn,
    requiredAnnualSavings,
    liquidityConstrained,
    floorClampedToCommitted,
    floorExceedsCeiling,
    drivers: { floor: floorDriver, ceiling: ceilingDriver },
  }
}
