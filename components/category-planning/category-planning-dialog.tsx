'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/contexts/currency-context'

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

const INCOME_CATEGORIES = new Set(['Income', 'Gift Money', 'Other Income'])

interface CategoryPlanningDialogProps {
  category?: string
  triggerLabel?: string
  title?: string
  onSaved?: () => void
}

function isIncomeCategory(category: string) {
  return INCOME_CATEGORIES.has(category)
}

export function CategoryPlanningDialog({
  category,
  triggerLabel = 'Edit Planning',
  title = 'Edit Category Planning',
  onSaved,
}: CategoryPlanningDialogProps) {
  const { currency, fxRate } = useCurrency()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<RowState[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  useEffect(() => {
    if (!open) return

    async function load() {
      setLoading(true)
      try {
        const response = await fetch('/api/category-planning', { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load category planning data')
        }

        const loadedRows = (result.rows ?? []) as RowState[]
        setRows(loadedRows)

        if (category) {
          setSelectedCategory(category)
        } else {
          setSelectedCategory((current) => current || loadedRows[0]?.category || '')
        }
      } catch (error: any) {
        console.error('CategoryPlanningDialog load error', error)
        toast.error(error.message || 'Failed to load category planning data')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [open, category])

  const categories = useMemo(() => rows.map((row) => row.category), [rows])

  const selectedRow = useMemo(() => {
    return rows.find((row) => row.category === selectedCategory) ?? null
  }, [rows, selectedCategory])

  const updateSelectedRow = (updater: (row: RowState) => RowState) => {
    setRows((prev) => prev.map((row) => {
      if (row.category !== selectedCategory) return row
      return updater(row)
    }))
  }

  const displayBudget = selectedRow
    ? Math.abs(currency === 'USD' ? selectedRow.annual_budget_usd : selectedRow.annual_budget_gbp)
    : 0

  const handleBudgetChange = (value: string) => {
    if (!selectedRow) return
    const parsed = value.trim() === '' ? 0 : Number(value)
    if (Number.isNaN(parsed)) return

    const signed = isIncomeCategory(selectedRow.category) ? Math.abs(parsed) : -Math.abs(parsed)
    const annual_budget_gbp = currency === 'GBP' ? signed : (fxRate ? signed / fxRate : signed)
    const annual_budget_usd = currency === 'USD' ? signed : (fxRate ? signed * fxRate : signed)

    updateSelectedRow((row) => ({
      ...row,
      annual_budget_gbp: Math.round(annual_budget_gbp * 100) / 100,
      annual_budget_usd: Math.round(annual_budget_usd * 100) / 100,
    }))
  }

  const handleSave = async () => {
    if (!selectedRow) return

    setSaving(true)
    try {
      const response = await fetch('/api/category-planning', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rows: [{
            category: selectedRow.category,
            annual_budget_gbp: selectedRow.annual_budget_gbp,
            annual_budget_usd: selectedRow.annual_budget_usd,
            current_year_method: selectedRow.current_year_method,
            current_month_method: selectedRow.current_month_method,
            manual_year_forecast: selectedRow.manual_year_forecast ?? null,
            manual_month_forecast: selectedRow.manual_month_forecast ?? null,
          }],
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save category planning')
      }

      toast.success('Category planning updated')
      onSaved?.()
      setOpen(false)
    } catch (error: any) {
      console.error('CategoryPlanningDialog save error', error)
      toast.error(error.message || 'Failed to save category planning')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-1" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-sm text-muted-foreground">Loading...</div>
        ) : !rows.length ? (
          <div className="py-6 text-sm text-muted-foreground">No categories found. Add categories in Settings.</div>
        ) : (
          <div className="space-y-4 mt-2">
            {!category && (
              <div className="space-y-2">
                <Label htmlFor="planning-category">Category</Label>
                <select
                  id="planning-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedRow && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="planning-budget">Annual Budget ({currency})</Label>
                  <Input
                    id="planning-budget"
                    type="number"
                    step="0.01"
                    value={displayBudget}
                    onChange={(e) => handleBudgetChange(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="planning-year-method">Annual Forecast Method</Label>
                  <select
                    id="planning-year-method"
                    value={selectedRow.current_year_method}
                    onChange={(e) => updateSelectedRow((row) => ({ ...row, current_year_method: e.target.value as YearMethod }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="Annual">Annual</option>
                    <option value="Linear">Linear</option>
                    <option value="Budget">Budget</option>
                    <option value="Manual">Manual</option>
                  </select>
                  {selectedRow.current_year_method === 'Manual' && (
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Manual annual forecast"
                      value={selectedRow.manual_year_forecast ?? ''}
                      onChange={(e) => updateSelectedRow((row) => ({
                        ...row,
                        manual_year_forecast: e.target.value.trim() === ''
                          ? null
                          : (Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value)),
                      }))}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="planning-month-method">Monthly Forecast Method</Label>
                  <select
                    id="planning-month-method"
                    value={selectedRow.current_month_method}
                    onChange={(e) => updateSelectedRow((row) => ({ ...row, current_month_method: e.target.value as MonthMethod }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="Linear">Linear</option>
                    <option value="Average">Average</option>
                    <option value="Manual">Manual</option>
                  </select>
                  {selectedRow.current_month_method === 'Manual' && (
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Manual monthly forecast"
                      value={selectedRow.manual_month_forecast ?? ''}
                      onChange={(e) => updateSelectedRow((row) => ({
                        ...row,
                        manual_month_forecast: e.target.value.trim() === ''
                          ? null
                          : (Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value)),
                      }))}
                    />
                  )}
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
