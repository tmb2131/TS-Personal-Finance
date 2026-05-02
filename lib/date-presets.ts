export type DatePresetId =
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'ytd'
  | 'last-12-months'
  | 'all'

export interface DatePreset {
  id: DatePresetId
  label: string
  shortLabel: string
}

export const DATE_PRESETS: DatePreset[] = [
  { id: 'this-month', label: 'This month', shortLabel: 'MTD' },
  { id: 'last-month', label: 'Last month', shortLabel: 'Last mo' },
  { id: 'last-3-months', label: 'Last 3 months', shortLabel: '3 mo' },
  { id: 'ytd', label: 'Year to date', shortLabel: 'YTD' },
  { id: 'last-12-months', label: 'Last 12 months', shortLabel: '12 mo' },
  { id: 'all', label: 'All time', shortLabel: 'All' },
]

export interface DateWindow {
  start: Date
  end: Date
}

function startOfDay(date: Date): Date {
  const out = new Date(date)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(date: Date): Date {
  const out = new Date(date)
  out.setHours(23, 59, 59, 999)
  return out
}

export function getWindowForPreset(preset: DatePresetId, now = new Date()): DateWindow | null {
  const today = startOfDay(now)
  switch (preset) {
    case 'this-month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start, end: endOfDay(today) }
    }
    case 'last-month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
      return { start, end }
    }
    case 'last-3-months': {
      const start = new Date(today.getFullYear(), today.getMonth() - 2, 1)
      return { start, end: endOfDay(today) }
    }
    case 'ytd': {
      const start = new Date(today.getFullYear(), 0, 1)
      return { start, end: endOfDay(today) }
    }
    case 'last-12-months': {
      const start = new Date(today)
      start.setMonth(start.getMonth() - 12)
      return { start: startOfDay(start), end: endOfDay(today) }
    }
    case 'all':
      return null
  }
}

/** The comparable prior period of the same length, ending the day before `window.start`. */
export function getPriorWindow(window: DateWindow): DateWindow {
  const lengthMs = window.end.getTime() - window.start.getTime()
  const end = new Date(window.start.getTime() - 1)
  const start = new Date(end.getTime() - lengthMs)
  return { start, end }
}

/** Days back from today required to cover this preset (for fetching). */
export function fetchDaysForPreset(preset: DatePresetId, now = new Date()): number | null {
  const win = getWindowForPreset(preset, now)
  if (!win) return null
  const today = startOfDay(now)
  const days = Math.ceil((today.getTime() - win.start.getTime()) / (1000 * 60 * 60 * 24))
  // Double the window so we also have the comparable prior period available client-side.
  const doubled = days * 2 + 7
  return Math.max(doubled, 30)
}

export function isInWindow(dateStr: string, window: DateWindow | null): boolean {
  if (!window) return true
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  return d >= window.start && d <= window.end
}
