'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useFinancialAssumptions } from '@/lib/hooks/queries/use-financial-assumptions'
import { DEFAULT_FINANCIAL_ASSUMPTIONS } from '@/lib/hooks/use-sustainable-spend'
import { queryKeys } from '@/lib/query-keys'
import { RETURN_PROFILE_OPTIONS } from '@/lib/return-assumptions'
import type { ReturnProfile, SpendingFloorMode, WealthTargetTerms } from '@/lib/types'
import { Scale } from 'lucide-react'
import { WealthTargetTermsToggle } from '@/components/sustainable-spend/wealth-target-terms-toggle'
import {
  wealthTargetInputLabel,
  wealthTargetTermsHelper,
} from '@/lib/wealth-target-terms'

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function FinancialAssumptionsSection() {
  const queryClient = useQueryClient()
  const { currency } = useCurrency()
  const { data: stored, isLoading } = useFinancialAssumptions()

  const [returnProfile, setReturnProfile] = useState<ReturnProfile>(
    DEFAULT_FINANCIAL_ASSUMPTIONS.return_profile
  )
  const [inflationPct, setInflationPct] = useState('3')
  const [floorMode, setFloorMode] = useState<SpendingFloorMode>(
    DEFAULT_FINANCIAL_ASSUMPTIONS.floor_mode
  )
  const [savingsRatePct, setSavingsRatePct] = useState('20')
  const [wealthTarget, setWealthTarget] = useState('')
  const [wealthTargetTerms, setWealthTargetTerms] = useState<WealthTargetTerms>(
    DEFAULT_FINANCIAL_ASSUMPTIONS.wealth_target_terms
  )
  const [horizonYears, setHorizonYears] = useState('20')
  const [emergencyMonths, setEmergencyMonths] = useState('6')
  const [includeTrust, setIncludeTrust] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (isLoading || hydrated) return
    if (stored) {
      setReturnProfile(stored.return_profile)
      setInflationPct(String(Math.round(Number(stored.inflation_rate) * 1000) / 10))
      setFloorMode(stored.floor_mode)
      setSavingsRatePct(String(Math.round(Number(stored.target_savings_rate) * 1000) / 10))
      const target =
        currency === 'USD' ? stored.wealth_target_usd : stored.wealth_target_gbp
      setWealthTarget(target != null ? String(Math.round(target)) : '')
      setWealthTargetTerms(stored.wealth_target_terms ?? 'real')
      setHorizonYears(String(stored.horizon_years))
      setEmergencyMonths(String(Number(stored.emergency_fund_months)))
      setIncludeTrust(stored.include_trust)
    }
    setHydrated(true)
  }, [stored, isLoading, hydrated, currency])

  const handleSave = async () => {
    const inflation = Number(inflationPct) / 100
    const savingsRate = Number(savingsRatePct) / 100
    const horizon = Number(horizonYears)
    const emergency = Number(emergencyMonths)
    const target = wealthTarget.trim() === '' ? null : Number(wealthTarget)

    if (!Number.isFinite(inflation) || inflation < 0 || inflation > 0.25) {
      toast.error('Inflation must be between 0% and 25%')
      return
    }
    if (!Number.isFinite(savingsRate) || savingsRate < 0 || savingsRate > 1) {
      toast.error('Target savings rate must be between 0% and 100%')
      return
    }
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 80) {
      toast.error('Horizon must be between 1 and 80 years')
      return
    }
    if (!Number.isFinite(emergency) || emergency < 0 || emergency > 60) {
      toast.error('Emergency fund target must be between 0 and 60 months')
      return
    }
    if (target != null && (!Number.isFinite(target) || target <= 0)) {
      toast.error('Wealth target must be a positive amount')
      return
    }
    if (floorMode === 'wealth_target' && target == null) {
      toast.error('Set a wealth target or switch the floor to a target savings rate')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/financial-assumptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_profile: returnProfile,
          inflation_rate: inflation,
          floor_mode: floorMode,
          target_savings_rate: savingsRate,
          wealth_target: target,
          currency,
          horizon_years: horizon,
          emergency_fund_months: emergency,
          include_trust: includeTrust,
          wealth_target_terms: wealthTargetTerms,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Failed to save assumptions')
        return
      }
      toast.success('Financial assumptions saved')
      queryClient.invalidateQueries({ queryKey: queryKeys.financialAssumptions })
    } catch {
      toast.error('Failed to save assumptions')
    } finally {
      setSaving(false)
    }
  }

  const symbol = currency === 'USD' ? '$' : '£'

  return (
    <Card id="financial-assumptions" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-indigo-600" />
          Financial Assumptions
        </CardTitle>
        <CardDescription>
          Drives your sustainable spending range: the ceiling comes from income plus real returns
          on net worth, the floor from the savings your goal requires. Also used by the Financial
          Independence calculator on the Liquidity page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && !hydrated ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="return-profile">Return profile</Label>
                <select
                  id="return-profile"
                  value={returnProfile}
                  onChange={(e) => setReturnProfile(e.target.value as ReturnProfile)}
                  className={selectClass}
                >
                  {RETURN_PROFILE_OPTIONS.map((profile) => (
                    <option key={profile} value={profile}>
                      {profile}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Nominal return assumptions by asset category (shared with the FI calculator).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inflation-rate">Inflation (% per year)</Label>
                <Input
                  id="inflation-rate"
                  type="number"
                  min="0"
                  max="25"
                  step="0.1"
                  value={inflationPct}
                  onChange={(e) => setInflationPct(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="floor-mode">Spending floor based on</Label>
                <select
                  id="floor-mode"
                  value={floorMode}
                  onChange={(e) => setFloorMode(e.target.value as SpendingFloorMode)}
                  className={selectClass}
                >
                  <option value="savings_rate">Target savings rate</option>
                  <option value="wealth_target">Wealth target by horizon</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Spending below the floor means you are saving more than your goal requires.
                </p>
              </div>
              {floorMode === 'savings_rate' ? (
                <div className="space-y-2">
                  <Label htmlFor="savings-rate">Target savings rate (% of income)</Label>
                  <Input
                    id="savings-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={savingsRatePct}
                    onChange={(e) => setSavingsRatePct(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <WealthTargetTermsToggle
                    value={wealthTargetTerms}
                    onChange={setWealthTargetTerms}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="wealth-target">
                        {wealthTargetInputLabel(symbol, wealthTargetTerms)}
                      </Label>
                      <Input
                        id="wealth-target"
                        type="number"
                        min="0"
                        step="10000"
                        placeholder={`e.g. ${symbol === '$' ? '3000000' : '2500000'}`}
                        value={wealthTarget}
                        onChange={(e) => setWealthTarget(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="horizon-years">Horizon (years)</Label>
                      <Input
                        id="horizon-years"
                        type="number"
                        min="1"
                        max="80"
                        step="1"
                        value={horizonYears}
                        onChange={(e) => setHorizonYears(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {wealthTargetTermsHelper(wealthTargetTerms)}
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emergency-months">Emergency fund target (months of cash)</Label>
                <Input
                  id="emergency-months"
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={emergencyMonths}
                  onChange={(e) => setEmergencyMonths(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  While cash runway is below this, the spending ceiling is capped at income + gifts.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Net worth scope</Label>
                <label
                  htmlFor="include-trust"
                  className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm cursor-pointer"
                >
                  <Checkbox
                    id="include-trust"
                    checked={includeTrust}
                    onCheckedChange={(v) => setIncludeTrust(v === true)}
                  />
                  <span>Include Trust accounts</span>
                </label>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving assumptions...' : 'Save assumptions'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
