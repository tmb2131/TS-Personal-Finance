"use client"

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { useCurrency } from '@/lib/contexts/currency-context'
import { getDefaultForecastMethods } from '@/lib/forecasting'

type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'
type MonthMethod = 'Linear' | 'Average' | 'Manual'
type BudgetInputMode = 'app' | 'sheet'

interface RowState {
  category: string
  annual_budget_gbp: number
  annual_budget_usd: number
  current_year_method: YearMethod
  current_month_method: MonthMethod
  manual_year_forecast?: number | null
  manual_month_forecast?: number | null
  budget_data_source?: 'google_sheet' | 'plaid' | 'csv' | 'manual' | null
}

const INCOME_CATEGORIES = new Set(['Income', 'Gift Money', 'Other Income'])

const yearMethodHelp: Record<YearMethod, string> = {
  Annual: 'YTD + (Annual Budget × % year remaining)',
  Linear: 'YTD ÷ % year elapsed (run-rate)',
  Budget: 'Use budget unless YTD already exceeded it',
  Manual: 'Use your manual annual override',
}

const monthMethodHelp: Record<MonthMethod, string> = {
  Linear: 'MTD ÷ % month elapsed (run-rate)',
  Average: 'Last 3 full months average (or MTD if higher)',
  Manual: 'Use your manual monthly override',
}

const sourceLabels: Record<NonNullable<RowState['budget_data_source']>, string> = {
  google_sheet: 'Sheet',
  plaid: 'Plaid',
  csv: 'CSV',
  manual: 'In-app',
}

function isIncomeCategory(category: string) {
  return INCOME_CATEGORIES.has(category)
}

export function CategoryPlanningSection() {
  const { currency, fxRate } = useCurrency()
  const [rows, setRows] = useState<RowState[]>([])
  const [budgetInputMode, setBudgetInputMode] = useState<BudgetInputMode>('app')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const response = await fetch('/api/category-planning', { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load category planning data')
        }
        setRows(result.rows ?? [])
        setBudgetInputMode(result.budget_input_mode === 'sheet' ? 'sheet' : 'app')
      } catch (error: any) {
        console.error('CategoryPlanningSection load error', error)
        toast.error(error.message || 'Failed to load category planning data')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => row.category.toLowerCase().includes(q))
  }, [rows, search])

  const getDisplayBudget = (row: RowState) => {
    const raw = currency === 'USD' ? row.annual_budget_usd : row.annual_budget_gbp
    return Math.abs(raw)
  }

  const setBudgetFromDisplay = (category: string, value: string) => {
    const parsed = value.trim() === '' ? 0 : Number(value)
    if (Number.isNaN(parsed)) return

    setRows((prev) => prev.map((row) => {
      if (row.category !== category) return row
      const absValue = Math.abs(parsed)
      const signed = isIncomeCategory(category) ? absValue : -absValue
      const annual_budget_gbp = currency === 'GBP' ? signed : (fxRate ? signed / fxRate : signed)
      const annual_budget_usd = currency === 'USD' ? signed : (fxRate ? signed * fxRate : signed)

      return {
        ...row,
        annual_budget_gbp: Math.round(annual_budget_gbp * 100) / 100,
        annual_budget_usd: Math.round(annual_budget_usd * 100) / 100,
      }
    }))
  }

  const handleMethodChange = (
    category: string,
    key: 'current_year_method' | 'current_month_method',
    value: YearMethod | MonthMethod
  ) => {
    setRows((prev) => prev.map((row) => (
      row.category === category
        ? { ...row, [key]: value }
        : row
    )))
  }

  const handleManualChange = (
    category: string,
    key: 'manual_year_forecast' | 'manual_month_forecast',
    value: string
  ) => {
    const parsed = value.trim() === '' ? null : Number(value)
    setRows((prev) => prev.map((row) => (
      row.category === category
        ? { ...row, [key]: Number.isNaN(parsed) ? null : parsed }
        : row
    )))
  }

  const addCategory = () => {
    const category = newCategory.trim()
    if (!category) return

    const exists = rows.some((row) => row.category.toLowerCase() === category.toLowerCase())
    if (exists) {
      toast.error('Category already exists')
      return
    }

    const defaults = getDefaultForecastMethods(category)
    setRows((prev) => [
      ...prev,
      {
        category,
        annual_budget_gbp: 0,
        annual_budget_usd: 0,
        current_year_method: defaults.year,
        current_month_method: defaults.month,
        manual_year_forecast: null,
        manual_month_forecast: null,
        budget_data_source: 'manual' as const,
      },
    ].sort((a, b) => a.category.localeCompare(b.category)))
    setNewCategory('')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/category-planning', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          budget_input_mode: budgetInputMode,
          rows: rows.map((row) => ({
            category: row.category,
            annual_budget_gbp: row.annual_budget_gbp,
            annual_budget_usd: row.annual_budget_usd,
            current_year_method: row.current_year_method,
            current_month_method: row.current_month_method,
            manual_year_forecast: row.manual_year_forecast ?? null,
            manual_month_forecast: row.manual_month_forecast ?? null,
          })),
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save category planning')
      }

      toast.success('Category planning saved')
      if (budgetInputMode === 'app') {
        toast.message('Google sync will now ignore the Budget Targets sheet tab.')
      }
    } catch (error: any) {
      console.error('CategoryPlanningSection save error', error)
      toast.error(error.message || 'Failed to save category planning')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="border" id="category-planning">
        <CardHeader>
          <CardTitle>Category Planning</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading category planning settings...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border" id="category-planning">
      <CardHeader>
        <CardTitle>Category Planning</CardTitle>
        <p className="text-sm text-muted-foreground">
          Manage the three category planning inputs in one place: annual forecast methodology, monthly forecast methodology, and annual budget.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <div className="space-y-2">
            <Label htmlFor="category-search">Search categories</Label>
            <Input
              id="category-search"
              placeholder="Search category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget-input-mode">Budget source</Label>
            <select
              id="budget-input-mode"
              value={budgetInputMode}
              onChange={(e) => setBudgetInputMode(e.target.value as BudgetInputMode)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="app">In-app (recommended)</option>
              <option value="sheet">Google Sheet Budget Targets tab</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="new-category">Add category</Label>
            <Input
              id="new-category"
              placeholder="e.g. Travel"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCategory()
                }
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={addCategory} className="md:mb-0.5">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        <div className="overflow-auto rounded-md border">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-52">Category</TableHead>
                <TableHead className="w-36 text-right">Annual Budget ({currency})</TableHead>
                <TableHead className="w-56">Annual Forecast Method</TableHead>
                <TableHead className="w-56">Monthly Forecast Method</TableHead>
                <TableHead className="w-28">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      className="text-right"
                      value={getDisplayBudget(row)}
                      onChange={(e) => setBudgetFromDisplay(row.category, e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      aria-label={`Annual method for ${row.category}`}
                      value={row.current_year_method}
                      onChange={(e) => handleMethodChange(row.category, 'current_year_method', e.target.value as YearMethod)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="Annual">Annual</option>
                      <option value="Linear">Linear</option>
                      <option value="Budget">Budget</option>
                      <option value="Manual">Manual</option>
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">{yearMethodHelp[row.current_year_method]}</p>
                    {row.current_year_method === 'Manual' && (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Manual annual forecast"
                        value={row.manual_year_forecast ?? ''}
                        onChange={(e) => handleManualChange(row.category, 'manual_year_forecast', e.target.value)}
                        className="mt-2"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <select
                      aria-label={`Monthly method for ${row.category}`}
                      value={row.current_month_method}
                      onChange={(e) => handleMethodChange(row.category, 'current_month_method', e.target.value as MonthMethod)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="Linear">Linear</option>
                      <option value="Average">Average</option>
                      <option value="Manual">Manual</option>
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">{monthMethodHelp[row.current_month_method]}</p>
                    {row.current_month_method === 'Manual' && (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Manual monthly forecast"
                        value={row.manual_month_forecast ?? ''}
                        onChange={(e) => handleManualChange(row.category, 'manual_month_forecast', e.target.value)}
                        className="mt-2"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex h-7 items-center rounded-md border px-2 text-xs text-muted-foreground">
                      {row.budget_data_source ? sourceLabels[row.budget_data_source] : 'None'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {budgetInputMode === 'app'
              ? 'In-app mode keeps category budgets editable in Findash and skips Budget Targets sync from Google Sheets.'
              : 'Sheet mode refreshes category budgets from the Google Sheet Budget Targets tab when you sync.'}
          </p>
          <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
            {saving ? (
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
