"use client"

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { HelpCircle, Loader2, Plus, Search } from 'lucide-react'
import { useCurrency } from '@/lib/contexts/currency-context'
import { getDefaultForecastMethods } from '@/lib/forecasting'
import { isExcludedCategory, isIncomeCategory } from '@/lib/category-filters'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'
type MonthMethod = 'Linear' | 'Average' | 'Manual'

interface RowState {
  category: string
  annual_budget_gbp: number
  annual_budget_usd: number
  current_year_method: YearMethod
  current_month_method: MonthMethod
  manual_year_forecast?: number | null
  manual_month_forecast?: number | null
}

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

const selectInputClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function CategoryPlanningSection() {
  const { currency, fxRate } = useCurrency()
  const [rows, setRows] = useState<RowState[]>([])
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
    const visibleRows = rows.filter((row) => !isExcludedCategory(row.category))
    if (!q) return visibleRows
    return visibleRows.filter((row) => row.category.toLowerCase().includes(q))
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
    if (isExcludedCategory(category)) {
      toast.error('Excluded category is hidden from planning.')
      return
    }

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
          <Skeleton className="h-4 w-96 max-w-full mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-20 md:mb-0.5" />
          </div>
          <div className="overflow-auto rounded-md border">
            <div className="min-w-[900px] p-4 space-y-3">
              <div className="flex gap-4 pb-2 border-b border-border">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-40" />
              </div>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-10 w-40" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border" id="category-planning">
      <CardHeader>
        <CardTitle>Category Planning</CardTitle>
        <CardDescription>
          Set annual budgets and how annual and monthly forecasts are computed per category.
        </CardDescription>
      </CardHeader>
      <TooltipProvider delayDuration={300}>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="category-search">Search categories</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              id="category-search"
              placeholder="Search category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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

        <div className="overflow-auto rounded-md border max-h-[60vh]">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-muted/50 sticky top-0 z-10 bg-muted border-b border-border">
                <TableHead className="w-52">Category</TableHead>
                <TableHead className="w-36 text-right">Annual Budget ({currency})</TableHead>
                <TableHead className="w-56">Annual Forecast Method</TableHead>
                <TableHead className="w-56">Monthly Forecast Method</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      title={search.trim() ? 'No categories match your search' : 'No categories yet'}
                      description={search.trim() ? 'Try a different search or add a new category above.' : 'Add a category above to get started.'}
                      className="py-8"
                    />
                    {search.trim() && (
                      <div className="flex justify-center pb-6">
                        <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                          Clear search
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : filteredRows.map((row) => (
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
                    <div className="flex items-start gap-1.5">
                      <select
                        aria-label={`Annual method for ${row.category}`}
                        value={row.current_year_method}
                        onChange={(e) => handleMethodChange(row.category, 'current_year_method', e.target.value as YearMethod)}
                        className={selectInputClass}
                      >
                        <option value="Annual">Annual</option>
                        <option value="Linear">Linear</option>
                        <option value="Budget">Budget</option>
                        <option value="Manual">Manual</option>
                      </select>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 mt-1.5"
                            aria-label={`Annual method help for ${row.category}`}
                          >
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          {yearMethodHelp[row.current_year_method]}
                        </TooltipContent>
                      </Tooltip>
                    </div>
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
                    <div className="flex items-start gap-1.5">
                      <select
                        aria-label={`Monthly method for ${row.category}`}
                        value={row.current_month_method}
                        onChange={(e) => handleMethodChange(row.category, 'current_month_method', e.target.value as MonthMethod)}
                        className={selectInputClass}
                      >
                        <option value="Linear">Linear</option>
                        <option value="Average">Average</option>
                        <option value="Manual">Manual</option>
                      </select>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 mt-1.5"
                            aria-label={`Monthly method help for ${row.category}`}
                          >
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          {monthMethodHelp[row.current_month_method]}
                        </TooltipContent>
                      </Tooltip>
                    </div>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Separator className="my-4" />
        <div className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Budgets are app-managed only. Google sync does not import Budget Targets.
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
      </TooltipProvider>
    </Card>
  )
}
