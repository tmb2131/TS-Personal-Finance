'use client'

import { useMemo, useState } from 'react'
import { ForecastBridgeChart } from './forecast-bridge-chart'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'

const PRESETS = [
  { id: 'yesterday', label: 'Yesterday', daysAgo: 1 },
  { id: 'last-week', label: 'Last Week', daysAgo: 7 },
  { id: 'last-month', label: 'Last Month', daysAgo: 30 },
] as const

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function ForecastEvolutionSection() {
  const [presetId, setPresetId] = useState<string>('last-week')

  const { startDate, endDate } = useMemo(() => {
    const end = new Date()
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1]
    const start = new Date(end)
    start.setDate(start.getDate() - preset.daysAgo)
    return {
      startDate: toDateString(start),
      endDate: toDateString(end),
    }
  }, [presetId])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Label htmlFor="forecast-compare" className="text-sm font-medium">
          Compare to:
        </Label>
        <select
          id="forecast-compare"
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          className={cn(
            'h-9 w-full sm:w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
          )}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <ForecastBridgeChart startDate={startDate} endDate={endDate} />
    </div>
  )
}
