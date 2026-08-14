'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  RETURN_PROFILE_OPTIONS,
  RETURN_ASSUMPTIONS_BY_PROFILE,
  returnProfileLabel,
} from '@/lib/return-assumptions'
import type { ReturnProfile, SpendingFloorMode } from '@/lib/types'
import { wealthTargetInputLabel, wealthTargetTermsHelper } from '@/lib/wealth-target-terms'
import { cn } from '@/utils/cn'
import { RotateCcw, Settings2 } from 'lucide-react'
import type { DraftAssumptions } from './spend-explorer'
import { WealthTargetTermsToggle } from './wealth-target-terms-toggle'
import { NominalReturnsEditor } from '@/components/settings/nominal-returns-editor'

interface AssumptionsPanelProps {
  draft: DraftAssumptions
  onChange: (patch: Partial<DraftAssumptions>) => void
  onSave: () => void
  onReset: () => void
  saving: boolean
  dirty: boolean
  hasCustomAssumptions: boolean
  symbol: string
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  valueLabel: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <span className="text-sm font-semibold num">{valueLabel}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      />
    </div>
  )
}

export function AssumptionsPanel({
  draft,
  onChange,
  onSave,
  onReset,
  saving,
  dirty,
  hasCustomAssumptions,
  symbol,
}: AssumptionsPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Assumptions
          </span>
          {dirty ? (
            <Badge variant="outline" className="text-muted-foreground border-amber-500/50">
              Unsaved what-if
            </Badge>
          ) : !hasCustomAssumptions ? (
            <Badge variant="outline" className="text-muted-foreground">
              Defaults
            </Badge>
          ) : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Every change recalculates the range instantly. Save to make it your baseline everywhere
          in the app.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Return profile */}
        <div className="space-y-2">
          <Label className="text-xs">Return profile</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {RETURN_PROFILE_OPTIONS.map((profile: ReturnProfile) => (
              <Button
                key={profile}
                type="button"
                size="sm"
                variant={draft.returnProfile === profile ? 'default' : 'outline'}
                onClick={() =>
                  onChange({
                    returnProfile: profile,
                    returnAssumptions: RETURN_ASSUMPTIONS_BY_PROFILE[profile],
                  })
                }
                className="h-8 px-1 text-xs"
              >
                {returnProfileLabel(profile)}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sets the nominal return assumed for each asset category.
          </p>
          <NominalReturnsEditor
            value={draft.returnAssumptions}
            onChange={(returnAssumptions) => onChange({ returnAssumptions })}
            idPrefix="explorer-nominal-return"
            compact
          />
        </div>

        <SliderRow
          label="Inflation (per year)"
          valueLabel={`${(draft.inflationRate * 100).toFixed(1)}%`}
          min={0}
          max={10}
          step={0.1}
          value={Math.round(draft.inflationRate * 1000) / 10}
          onChange={(v) => onChange({ inflationRate: v / 100 })}
        />

        {/* Floor basis */}
        <div className="space-y-2 border-t pt-4">
          <Label className="text-xs">Spending floor based on</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['savings_rate', 'Savings rate'],
                ['wealth_target', 'Wealth target'],
              ] as [SpendingFloorMode, string][]
            ).map(([mode, label]) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={draft.floorMode === mode ? 'default' : 'outline'}
                onClick={() => onChange({ floorMode: mode })}
                className="h-8 px-1 text-xs"
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Spending below the floor means saving more than your goal requires.
          </p>
        </div>

        {draft.floorMode === 'savings_rate' ? (
          <SliderRow
            label="Target savings rate (of income)"
            valueLabel={`${Math.round(draft.targetSavingsRate * 100)}%`}
            min={0}
            max={60}
            step={1}
            value={Math.round(draft.targetSavingsRate * 100)}
            onChange={(v) => onChange({ targetSavingsRate: v / 100 })}
          />
        ) : (
          <>
            <WealthTargetTermsToggle
              value={draft.wealthTargetTerms}
              onChange={(wealthTargetTerms) => onChange({ wealthTargetTerms })}
            />
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="explorer-wealth-target" className="text-xs">
                  {wealthTargetInputLabel(symbol, draft.wealthTargetTerms)}
                </Label>
              </div>
              <Input
                id="explorer-wealth-target"
                type="number"
                min="0"
                step="10000"
                placeholder={`e.g. ${symbol === '$' ? '3000000' : '2500000'}`}
                value={draft.wealthTarget != null ? String(Math.round(draft.wealthTarget)) : ''}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  const num = v === '' ? null : Number(v)
                  onChange({
                    wealthTarget: num != null && Number.isFinite(num) && num > 0 ? num : null,
                  })
                }}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                {wealthTargetTermsHelper(draft.wealthTargetTerms)}
              </p>
            </div>
            <SliderRow
              label="Horizon"
              valueLabel={`${draft.horizonYears} yrs`}
              min={1}
              max={60}
              step={1}
              value={draft.horizonYears}
              onChange={(v) => onChange({ horizonYears: v })}
            />
          </>
        )}

        <div className="border-t pt-4 space-y-5">
          <SliderRow
            label="Emergency fund target (months of cash)"
            valueLabel={`${draft.emergencyFundMonths} mo`}
            min={0}
            max={24}
            step={1}
            value={draft.emergencyFundMonths}
            onChange={(v) => onChange({ emergencyFundMonths: v })}
          />
          <label
            htmlFor="explorer-include-trust"
            className="flex items-center gap-2 rounded-md border border-input px-3 py-2.5 text-sm cursor-pointer"
          >
            <Checkbox
              id="explorer-include-trust"
              checked={draft.includeTrust}
              onCheckedChange={(v) => onChange({ includeTrust: v === true })}
            />
            <span>Include Trust accounts in net worth</span>
          </label>
        </div>

        <div className="flex items-center gap-2 border-t pt-4">
          <Button onClick={onSave} disabled={saving || !dirty} className="flex-1">
            {saving ? 'Saving...' : 'Save assumptions'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            disabled={saving || !dirty}
            aria-label="Reset to saved assumptions"
          >
            <RotateCcw className={cn('h-4 w-4', dirty ? '' : 'opacity-50')} />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
