'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  EDITABLE_RETURN_CATEGORIES,
  MAX_NOMINAL_RETURN,
  MIN_NOMINAL_RETURN,
  type ReturnAssumptions,
} from '@/lib/return-assumptions'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface NominalReturnsEditorProps {
  value: ReturnAssumptions
  onChange: (value: ReturnAssumptions) => void
  idPrefix?: string
  compact?: boolean
}

function pctToDecimal(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed / 100
}

function decimalToPct(value: number): string {
  const pct = value * 100
  const rounded = Math.round(pct * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function updateRate(
  current: ReturnAssumptions,
  key: 'defaultNominalReturn' | string,
  pctValue: string
): ReturnAssumptions | null {
  const decimal = pctToDecimal(pctValue)
  // Negative rates are valid. A floor of zero cannot express a drawdown year.
  if (decimal == null || decimal < MIN_NOMINAL_RETURN || decimal > MAX_NOMINAL_RETURN) return null

  if (key === 'defaultNominalReturn') {
    return { ...current, defaultNominalReturn: decimal }
  }

  return {
    ...current,
    nominalReturns: {
      ...current.nominalReturns,
      [key]: decimal,
    },
  }
}

export function NominalReturnsEditor({
  value,
  onChange,
  idPrefix = 'nominal-return',
  compact = false,
}: NominalReturnsEditorProps) {
  const [open, setOpen] = useState(false)

  const handleRateChange = (key: 'defaultNominalReturn' | string, pctValue: string) => {
    const next = updateRate(value, key, pctValue)
    if (next) onChange(next)
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'h-auto w-full justify-between px-0 py-1 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground',
          compact && 'text-[11px]'
        )}
        aria-expanded={open}
      >
        <span>Nominal returns by category</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </Button>

      {open && (
        <div className="space-y-3 rounded-md border border-input p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-default`} className="text-xs">
              Default (other categories)
            </Label>
            <div className="relative max-w-[120px]">
              <Input
                id={`${idPrefix}-default`}
                type="number"
                min={MIN_NOMINAL_RETURN * 100}
                max={MAX_NOMINAL_RETURN * 100}
                step="0.1"
                value={decimalToPct(value.defaultNominalReturn)}
                onChange={(e) => handleRateChange('defaultNominalReturn', e.target.value)}
                className="h-8 pr-7 text-sm"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                %
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {EDITABLE_RETURN_CATEGORIES.map((category) => (
              <div key={category} className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-${category}`} className="text-xs">
                  {category}
                </Label>
                <div className="relative">
                  <Input
                    id={`${idPrefix}-${category}`}
                    type="number"
                    min={MIN_NOMINAL_RETURN * 100}
                    max={MAX_NOMINAL_RETURN * 100}
                    step="0.1"
                    value={decimalToPct(
                      value.nominalReturns[category] ?? value.defaultNominalReturn
                    )}
                    onChange={(e) => handleRateChange(category, e.target.value)}
                    className="h-8 pr-7 text-sm"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
