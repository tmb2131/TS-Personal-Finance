'use client'

import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  EDITABLE_RETURN_CATEGORIES,
  MAX_NOMINAL_RETURN,
  MIN_NOMINAL_RETURN,
  RETURN_ASSUMPTIONS_BY_PROFILE,
  RETURN_PROFILE_OPTIONS,
  returnProfileLabel,
  type ReturnAssumptions,
} from '@/lib/return-assumptions'
import type { ReturnProfile } from '@/lib/types'
import { cn } from '@/utils/cn'

interface NominalReturnsTableProps {
  activeProfile: ReturnProfile
  value: ReturnAssumptions
  onProfileChange: (profile: ReturnProfile) => void
  onChange: (value: ReturnAssumptions) => void
  idPrefix?: string
}

type RowKey = 'defaultNominalReturn' | (typeof EDITABLE_RETURN_CATEGORIES)[number]

// EDITABLE_RETURN_CATEGORIES rather than ASSET_RETURN_CATEGORIES so the deprecated
// pre-split `Taconic` alias, which only exists to keep old stored rows parsing,
// stays out of the settings UI.
const TABLE_ROWS: { key: RowKey; label: string }[] = [
  { key: 'defaultNominalReturn', label: 'Default (other)' },
  ...EDITABLE_RETURN_CATEGORIES.map((category) => ({ key: category, label: category })),
]

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

function formatPct(value: number): string {
  return `${decimalToPct(value)}%`
}

function getPresetRate(profile: ReturnProfile, rowKey: RowKey): number {
  const preset = RETURN_ASSUMPTIONS_BY_PROFILE[profile]
  if (rowKey === 'defaultNominalReturn') return preset.defaultNominalReturn
  return preset.nominalReturns[rowKey] ?? preset.defaultNominalReturn
}

function getActiveRate(assumptions: ReturnAssumptions, rowKey: RowKey): number {
  if (rowKey === 'defaultNominalReturn') return assumptions.defaultNominalReturn
  return assumptions.nominalReturns[rowKey] ?? assumptions.defaultNominalReturn
}

function updateActiveRate(
  current: ReturnAssumptions,
  rowKey: RowKey,
  pctValue: string
): ReturnAssumptions | null {
  const decimal = pctToDecimal(pctValue)
  if (decimal == null || decimal < MIN_NOMINAL_RETURN || decimal > MAX_NOMINAL_RETURN) return null

  if (rowKey === 'defaultNominalReturn') {
    return { ...current, defaultNominalReturn: decimal }
  }

  return {
    ...current,
    nominalReturns: {
      ...current.nominalReturns,
      [rowKey]: decimal,
    },
  }
}

export function NominalReturnsTable({
  activeProfile,
  value,
  onProfileChange,
  onChange,
  idPrefix = 'settings-nominal-return',
}: NominalReturnsTableProps) {
  const handleRateChange = (rowKey: RowKey, pctValue: string) => {
    const next = updateActiveRate(value, rowKey, pctValue)
    if (next) onChange(next)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Nominal return by asset category. Select a profile column to edit; other columns show preset
        ranges for comparison. Rates may be negative — a Conservative profile that cannot lose money
        is a low-return scenario, not a downside one.
      </p>
      <div className="rounded-md border border-input overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[160px]">Category</TableHead>
              {RETURN_PROFILE_OPTIONS.map((profile) => {
                const isActive = profile === activeProfile
                return (
                  <TableHead key={profile} className="text-center">
                    <button
                      type="button"
                      onClick={() => onProfileChange(profile)}
                      className={cn(
                        'mx-auto inline-flex min-w-[88px] flex-col items-center rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                        isActive
                          ? 'bg-muted text-muted-foreground ring-1 ring-indigo-500/40'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                      aria-pressed={isActive}
                    >
                      {returnProfileLabel(profile)}
                      {isActive && (
                        <span className="text-[10px] font-normal text-muted-foreground/80">Active</span>
                      )}
                    </button>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {TABLE_ROWS.map(({ key, label }) => (
              <TableRow key={key} className="hover:bg-muted/20">
                <TableCell className="font-medium text-sm">{label}</TableCell>
                {RETURN_PROFILE_OPTIONS.map((profile) => {
                  const isActive = profile === activeProfile
                  const rate = isActive
                    ? getActiveRate(value, key)
                    : getPresetRate(profile, key)

                  return (
                    <TableCell
                      key={profile}
                      className={cn(
                        'text-center num',
                        isActive && 'bg-muted'
                      )}
                    >
                      {isActive ? (
                        <div className="relative mx-auto max-w-[88px]">
                          <Input
                            id={`${idPrefix}-${key}`}
                            type="number"
                            min={MIN_NOMINAL_RETURN * 100}
                            max={MAX_NOMINAL_RETURN * 100}
                            step="0.1"
                            value={decimalToPct(rate)}
                            onChange={(e) => handleRateChange(key, e.target.value)}
                            className="h-8 pr-7 text-center text-sm"
                            aria-label={`${label} ${profile} nominal return`}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            %
                          </span>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            'text-sm',
                            rate < 0 ? 'text-negative' : 'text-muted-foreground'
                          )}
                        >
                          {formatPct(rate)}
                        </span>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
