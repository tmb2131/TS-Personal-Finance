import type { ReturnProfile, SpendingFloorMode } from '@/lib/types'
import {
  RETURN_ASSUMPTIONS_BY_PROFILE,
  weightedRealReturn,
  type AssetMixEntry,
} from '@/lib/return-assumptions'

export type SpendRangePosition = 'below_floor' | 'in_range' | 'near_ceiling' | 'above_ceiling'

/** Spend at or above this fraction of the ceiling counts as "near ceiling". */
const NEAR_CEILING_FRACTION = 0.9

export interface SustainableSpendAssumptions {
  returnProfile: ReturnProfile
  inflationRate: number
  floorMode: SpendingFloorMode
  targetSavingsRate: number
  /** Net worth target in the same (display) currency as the monetary inputs. */
  wealthTarget: number | null
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
  drivers: { floor: string; ceiling: string }
}

/**
 * Annual savings needed to grow `netWorth` to `wealthTarget` over `horizonYears`
 * at real return `r` (sinking-fund payment in real terms).
 */
function requiredSavingsForWealthTarget(
  netWorth: number,
  wealthTarget: number,
  horizonYears: number,
  realReturn: number
): number {
  const n = Math.max(1, horizonYears)
  const r = realReturn
  const grownNetWorth = netWorth * Math.pow(1 + r, n)
  const gap = wealthTarget - grownNetWorth
  if (gap <= 0) return 0
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

  const profile = RETURN_ASSUMPTIONS_BY_PROFILE[assumptions.returnProfile]
  const realReturn = weightedRealReturn(assetMix, profile, assumptions.inflationRate)

  const inflows = Math.max(0, annualIncome) + Math.max(0, annualGiftMoney)

  // Ceiling: spend level at which real net worth is preserved.
  const uncappedCeilingAnnual = inflows + Math.max(0, netWorth * realReturn)
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
        realReturn
      )
    : Math.max(0, annualIncome) * assumptions.targetSavingsRate

  const rawFloor = inflows - requiredAnnualSavings
  const committed = Math.max(0, committedAnnualSpend ?? 0)
  const floorClampedToCommitted = committed > rawFloor
  const floorAnnual = Math.max(0, Math.min(ceilingAnnual, Math.max(rawFloor, committed)))

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
        : 'Your wealth target is already on track at current returns, so no extra savings are required'
      : `Floor driven by your ${Math.round(assumptions.targetSavingsRate * 100)}% target savings rate`
  const ceilingDriver = liquidityConstrained
    ? `Ceiling capped at income + gifts while cash runway is under your ${assumptions.emergencyFundMonths}-month target`
    : `Ceiling = income + gifts + ${(realReturn * 100).toFixed(1)}% real return on net worth`

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
    drivers: { floor: floorDriver, ceiling: ceilingDriver },
  }
}
