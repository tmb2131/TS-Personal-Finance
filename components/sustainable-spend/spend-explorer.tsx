'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useFinancialAssumptions } from '@/lib/hooks/queries/use-financial-assumptions'
import {
  DEFAULT_FINANCIAL_ASSUMPTIONS,
  resolveWealthTarget,
  useSustainableSpendInputs,
} from '@/lib/hooks/use-sustainable-spend'
import { queryKeys } from '@/lib/query-keys'
import {
  computeSustainableSpendRange,
  type SustainableSpendAssumptions,
} from '@/lib/sustainable-spend'
import { resolveReturnAssumptions, returnAssumptionsEqual } from '@/lib/return-assumptions'
import type { ReturnAssumptions } from '@/lib/return-assumptions'
import type { ReturnProfile, SpendingFloorMode, WealthTargetTerms } from '@/lib/types'
import { Scale } from 'lucide-react'
import { AssumptionsPanel } from './assumptions-panel'
import { RangeVisualization } from './range-visualization'
import { MethodologyCards } from './methodology-cards'
import { SensitivityChart } from './sensitivity-chart'

/** Editable assumption set; wealth target is in the display currency. */
export interface DraftAssumptions {
  returnProfile: ReturnProfile
  returnAssumptions: ReturnAssumptions
  inflationRate: number
  floorMode: SpendingFloorMode
  targetSavingsRate: number
  wealthTarget: number | null
  wealthTargetTerms: WealthTargetTerms
  horizonYears: number
  emergencyFundMonths: number
  includeTrust: boolean
}

export function toSpendAssumptions(draft: DraftAssumptions): SustainableSpendAssumptions {
  return {
    returnProfile: draft.returnProfile,
    returnAssumptions: draft.returnAssumptions,
    inflationRate: draft.inflationRate,
    floorMode: draft.floorMode,
    targetSavingsRate: draft.targetSavingsRate,
    wealthTarget: draft.wealthTarget,
    wealthTargetTerms: draft.wealthTargetTerms,
    horizonYears: draft.horizonYears,
    emergencyFundMonths: draft.emergencyFundMonths,
  }
}

function draftsEqual(a: DraftAssumptions, b: DraftAssumptions): boolean {
  return (
    a.returnProfile === b.returnProfile &&
    returnAssumptionsEqual(a.returnAssumptions, b.returnAssumptions) &&
    Math.abs(a.inflationRate - b.inflationRate) < 1e-9 &&
    a.floorMode === b.floorMode &&
    Math.abs(a.targetSavingsRate - b.targetSavingsRate) < 1e-9 &&
    (a.wealthTarget == null) === (b.wealthTarget == null) &&
    (a.wealthTarget == null || Math.abs((a.wealthTarget ?? 0) - (b.wealthTarget ?? 0)) < 0.5) &&
    a.wealthTargetTerms === b.wealthTargetTerms &&
    a.horizonYears === b.horizonYears &&
    Math.abs(a.emergencyFundMonths - b.emergencyFundMonths) < 1e-9 &&
    a.includeTrust === b.includeTrust
  )
}

export function SpendExplorer() {
  const queryClient = useQueryClient()
  const { currency, fxRate } = useCurrency()
  const { data: stored, isLoading: assumptionsLoading } = useFinancialAssumptions()
  const [draftState, setDraftState] = useState<DraftAssumptions | null>(null)
  const [saving, setSaving] = useState(false)

  // Saved assumptions (stored row or defaults), expressed as a draft in display currency
  const savedDraft = useMemo((): DraftAssumptions => {
    const resolved = { ...DEFAULT_FINANCIAL_ASSUMPTIONS, ...(stored ?? {}) }
    return {
      returnProfile: resolved.return_profile,
      returnAssumptions: resolveReturnAssumptions(
        resolved.return_profile,
        resolved.nominal_return_assumptions
      ),
      inflationRate: Number(resolved.inflation_rate),
      floorMode: resolved.floor_mode,
      targetSavingsRate: Number(resolved.target_savings_rate),
      wealthTarget: resolveWealthTarget(resolved, currency, fxRate),
      wealthTargetTerms: resolved.wealth_target_terms ?? 'real',
      horizonYears: Number(resolved.horizon_years),
      emergencyFundMonths: Number(resolved.emergency_fund_months),
      includeTrust: resolved.include_trust,
    }
  }, [stored, currency, fxRate])

  const draft = draftState ?? savedDraft
  const dirty = draftState != null && !draftsEqual(draftState, savedDraft)

  const { data: draftInputs, loading: draftInputsLoading } = useSustainableSpendInputs(
    draft.includeTrust
  )
  const { data: savedInputs } = useSustainableSpendInputs(savedDraft.includeTrust)

  const loading = assumptionsLoading || draftInputsLoading

  const draftResult = useMemo(() => {
    if (!draftInputs) return null
    return computeSustainableSpendRange({
      ...draftInputs,
      assumptions: toSpendAssumptions(draft),
    })
  }, [draftInputs, draft])

  const savedResult = useMemo(() => {
    if (!savedInputs) return null
    return computeSustainableSpendRange({
      ...savedInputs,
      assumptions: toSpendAssumptions(savedDraft),
    })
  }, [savedInputs, savedDraft])

  const handleChange = (patch: Partial<DraftAssumptions>) => {
    setDraftState({ ...draft, ...patch })
  }

  const handleReset = () => setDraftState(null)

  const handleSave = async () => {
    if (draft.floorMode === 'wealth_target' && draft.wealthTarget == null) {
      toast.error('Set a wealth target or switch the floor to a target savings rate')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/financial-assumptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_profile: draft.returnProfile,
          nominal_return_assumptions: draft.returnAssumptions,
          inflation_rate: draft.inflationRate,
          floor_mode: draft.floorMode,
          target_savings_rate: draft.targetSavingsRate,
          wealth_target: draft.wealthTarget,
          currency,
          horizon_years: draft.horizonYears,
          emergency_fund_months: draft.emergencyFundMonths,
          include_trust: draft.includeTrust,
          wealth_target_terms: draft.wealthTargetTerms,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Failed to save assumptions')
        return
      }
      toast.success('Financial assumptions saved')
      setDraftState(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.financialAssumptions })
    } catch {
      toast.error('Failed to save assumptions')
    } finally {
      setSaving(false)
    }
  }

  const symbol = currency === 'USD' ? '$' : '£'

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Sustainable Spending Range</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
        <div className="grid gap-4 md:gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (!draftInputs || !draftResult) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={Scale}
            title="Not enough data yet"
            description="The sustainable spend range needs account balances and a spending forecast. Sync your sheet or import transactions, then come back."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <RangeVisualization
        result={draftResult}
        savedResult={dirty ? savedResult : null}
        symbol={symbol}
      />
      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4">
          <AssumptionsPanel
            draft={draft}
            onChange={handleChange}
            onSave={handleSave}
            onReset={handleReset}
            saving={saving}
            dirty={dirty}
            hasCustomAssumptions={stored != null}
            symbol={symbol}
          />
        </div>
        <div className="space-y-4 md:space-y-6 min-w-0">
          <MethodologyCards
            inputs={draftInputs}
            result={draftResult}
            draft={draft}
            symbol={symbol}
          />
          <SensitivityChart inputs={draftInputs} draft={draft} symbol={symbol} />
        </div>
      </div>
    </div>
  )
}
