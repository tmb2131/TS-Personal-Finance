'use client'

import { useMemo, useState } from 'react'
import { ForecastBridgeChart } from './forecast-bridge-chart'
import { ForecastGapOverTimeChart } from './forecast-gap-over-time-chart'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'

const PRESETS = [
  { id: 'yesterday', label: 'Yesterday', daysAgo: 1 },
  { id: 'last-week', label: 'Last Week', daysAgo: 7 },
  { id: 'last-month', label: 'Last Month', daysAgo: 30 },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
] as const

/** Max span for Custom; 366 covers Jan 1 → Dec 31 in a leap year. */
const MAX_CUSTOM_DAYS = 366

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

export function ForecastEvolutionSection() {
  const [presetId, setPresetId] = useState<string>('last-week')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const { startDate, endDate } = useMemo(() => {
    const today = toDateString(new Date())
    const lastWeekStart = addDays(today, -7)

    if (presetId === 'ytd') {
      return {
        startDate: `${today.slice(0, 4)}-01-01`,
        endDate: today,
      }
    }

    if (presetId !== 'custom') {
      const preset = PRESETS.find(
        (p): p is (typeof PRESETS)[number] & { daysAgo: number } =>
          p.id === presetId && 'daysAgo' in p
      ) ?? { id: 'last-week', label: 'Last Week', daysAgo: 7 }
      const end = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - preset.daysAgo)
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      }
    }

    const rawStart = customStartDate || lastWeekStart
    const rawEnd = customEndDate || today
    let start = rawStart
    let end = rawEnd
    if (rawStart > rawEnd) {
      ;[start, end] = [rawEnd, rawStart]
    }
    const startMs = new Date(start + 'T12:00:00').getTime()
    const endMs = new Date(end + 'T12:00:00').getTime()
    const daysDiff = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000))
    if (daysDiff > MAX_CUSTOM_DAYS) {
      end = addDays(start, MAX_CUSTOM_DAYS)
    }
    return { startDate: start, endDate: end }
  }, [presetId, customStartDate, customEndDate])

  const handlePresetChange = (value: string) => {
    setPresetId(value)
    if (value === 'custom') {
      const today = toDateString(new Date())
      const lastWeekStart = addDays(today, -7)
      setCustomStartDate((prev) => prev || lastWeekStart)
      setCustomEndDate((prev) => prev || today)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Label htmlFor="forecast-compare" className="text-sm font-medium">
          Compare to:
        </Label>
        <select
          id="forecast-compare"
          value={presetId}
          onChange={(e) => handlePresetChange(e.target.value)}
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
      {presetId === 'custom' && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="forecast-custom-start" className="text-sm font-medium shrink-0">
              From
            </Label>
            <Input
              id="forecast-custom-start"
              type="date"
              value={customStartDate || startDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-9 w-full sm:w-[160px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="forecast-custom-end" className="text-sm font-medium shrink-0">
              To
            </Label>
            <Input
              id="forecast-custom-end"
              type="date"
              value={customEndDate || endDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-9 w-full sm:w-[160px]"
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ForecastGapOverTimeChart startDate={startDate} endDate={endDate} />
        <ForecastBridgeChart startDate={startDate} endDate={endDate} />
      </div>
    </div>
  )
}
