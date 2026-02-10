"use client"

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getDefaultForecastMethods } from '@/lib/forecasting'
import { Loader2 } from 'lucide-react'

type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'
type MonthMethod = 'Linear' | 'Average' | 'Manual'

interface RowState {
  category: string
  current_year_method: YearMethod
  current_month_method: MonthMethod
  manual_year_forecast?: number | null
  manual_month_forecast?: number | null
}

interface ForecastSettingsSectionProps {
  initialSettings: {
    category: string
    current_year_method: YearMethod
    current_month_method: MonthMethod
    manual_year_forecast?: number | null
    manual_month_forecast?: number | null
  }[]
}

const yearMethodHelp: Record<YearMethod, string> = {
  Annual: 'Budget-pro-rata: YTD + (Annual Budget × % year remaining)',
  Linear: 'Run-rate: YTD ÷ % year elapsed',
  Budget: 'Conservative: assumes budget; if YTD exceeds budget, use YTD',
  Manual: 'Manual: use your override value',
}

const monthMethodHelp: Record<MonthMethod, string> = {
  Linear: 'Run-rate: MTD ÷ % month elapsed',
  Average: 'Average: last 3 full months; if MTD exceeds avg, use MTD',
  Manual: 'Manual: use your override value',
}

export function ForecastSettingsSection({ initialSettings }: ForecastSettingsSectionProps) {
  const [rows, setRows] = useState<RowState[]>(initialSettings || [])
  const [loading, setLoading] = useState(false)

  // Load categories if settings missing categories (e.g. first time)
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: { user } }] = await Promise.all([supabase.auth.getUser()])
      if (!user) return
      const { data: categoriesRes } = await supabase.rpc('distinct_categories')
      // Fallback: if RPC missing, derive from budgets + transactions
      let categories: string[] = Array.isArray(categoriesRes) ? categoriesRes : []
      if (categories.length === 0) {
        const [budgets, tx] = await Promise.all([
          supabase.from('budget_targets').select('category'),
          supabase.from('transaction_log').select('category'),
        ])
        const set = new Set<string>()
        budgets.data?.forEach((b: any) => b.category && set.add(b.category))
        tx.data?.forEach((t: any) => t.category && set.add(t.category))
        categories = Array.from(set).sort()
      }

      setRows((prev) => {
        const existing = prev.length ? prev : initialSettings
        const byCategory = new Map(existing.map((r) => [r.category, r]))
        return categories.map((c) => {
          const row = byCategory.get(c)
          const defaults = getDefaultForecastMethods(c)
          return {
            category: c,
            current_year_method: row?.current_year_method ?? defaults.year,
            current_month_method: row?.current_month_method ?? defaults.month,
            manual_year_forecast: row?.manual_year_forecast ?? null,
            manual_month_forecast: row?.manual_month_forecast ?? null,
          }
        })
      })
    }
    load()
  }, [initialSettings])

  const handleChange = (category: string, key: 'current_year_method' | 'current_month_method', value: YearMethod | MonthMethod) => {
    setRows((prev) => prev.map((row) => (row.category === category ? { ...row, [key]: value } : row)))
  }

  const handleManualChange = (category: string, key: 'manual_year_forecast' | 'manual_month_forecast', value: string) => {
    const parsed = value.trim() === '' ? null : Number(value)
    setRows((prev) => prev.map((row) => (row.category === category ? { ...row, [key]: Number.isNaN(parsed) ? null : parsed } : row)))
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not signed in')
        setLoading(false)
        return
      }
      const payload = rows.map((r) => ({
        user_id: user.id,
        category: r.category,
        current_year_method: r.current_year_method,
        current_month_method: r.current_month_method,
        manual_year_forecast: r.manual_year_forecast ?? null,
        manual_month_forecast: r.manual_month_forecast ?? null,
      }))
      const { error } = await supabase.from('forecast_settings').upsert(payload, {
        onConflict: 'user_id,category',
      })
      if (error) throw error
      toast.success('Forecasting settings saved')
    } catch (err: any) {
      console.error('Save forecast settings error', err)
      toast.error('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  const definitions = useMemo(() => [
    {
      title: 'Annual (Budget-pro-rata)',
      body: 'YTD actual + (Annual Budget × % of year remaining). Assumes you finish the year at budget after accounting for what is already spent.',
    },
    {
      title: 'Linear (Run-rate)',
      body: 'YTD actual ÷ % of year elapsed. Extrapolates current pace through year-end.',
    },
    {
      title: 'Budget (Conservative floor)',
      body: 'Assumes budget; if YTD exceeds budget, use YTD.',
    },
    {
      title: 'Average (3-month mean)',
      body: 'Average of the last 3 full months. If current month exceeds that average, use the current month instead.',
    },
    {
      title: 'Manual',
      body: 'Use the manual override value you enter for the category.',
    },
    {
      title: 'Linear Month (Run-rate MTD)',
      body: 'MTD actual ÷ % of month elapsed. Assumes the rest of the month follows current pace.',
    },
  ], [])

  return (
    <Card className="border" id="forecast-settings">
      <CardHeader>
        <CardTitle>Forecasting Settings</CardTitle>
        <p className="text-sm text-muted-foreground">Assign forecasting methodologies per category. Annual and monthly trends will compute directly from transactions (no sheet tabs needed).</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-auto rounded-md border">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-48">Category</TableHead>
                <TableHead>Current Year Method</TableHead>
                <TableHead>Current Month Method</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell className="w-56">
                    <select
                      aria-label={`Year method for ${row.category}`}
                      value={row.current_year_method}
                      onChange={(e) => handleChange(row.category, 'current_year_method', e.target.value as YearMethod)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="Annual">Annual</option>
                      <option value="Linear">Linear</option>
                      <option value="Budget">Budget</option>
                      <option value="Manual">Manual</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">{yearMethodHelp[row.current_year_method]}</p>
                    {row.current_year_method === 'Manual' && (
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="Manual annual forecast"
                        value={row.manual_year_forecast ?? ''}
                        onChange={(e) => handleManualChange(row.category, 'manual_year_forecast', e.target.value)}
                        className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    )}
                  </TableCell>
                  <TableCell className="w-56">
                    <select
                      aria-label={`Month method for ${row.category}`}
                      value={row.current_month_method}
                      onChange={(e) => handleChange(row.category, 'current_month_method', e.target.value as MonthMethod)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="Linear">Linear</option>
                      <option value="Average">Average</option>
                      <option value="Manual">Manual</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">{monthMethodHelp[row.current_month_method]}</p>
                    {row.current_month_method === 'Manual' && (
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="Manual monthly forecast"
                        value={row.manual_month_forecast ?? ''}
                        onChange={(e) => handleManualChange(row.category, 'manual_month_forecast', e.target.value)}
                        className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Label className="text-sm">Method definitions</Label>
            <ul className="text-xs text-muted-foreground space-y-1 mt-1">
              {definitions.map((d) => (
                <li key={d.title} className="leading-snug">
                  <span className="font-medium text-foreground">{d.title}: </span>
                  {d.body}
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={handleSave} disabled={loading} className="min-w-[120px]">
            {loading ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span>
            ) : (
              'Save settings'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
