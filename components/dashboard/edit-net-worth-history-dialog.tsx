'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/lib/contexts/currency-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ApiRow = {
  year: number
  personal_gbp: number
  family_gbp: number
  trust_gbp: number
  personal_usd: number
  family_usd: number
  trust_usd: number
  has_manual_override: boolean
}

type EditorRow = {
  id: string
  year: string
  personal: string
  family: string
  trust: string
  hasManualOverride: boolean
  isNew: boolean
}

type BaselineRow = {
  personal: number
  family: number
  trust: number
}

const EPSILON = 0.0001

function parseNumericInput(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : NaN
}

function formatInputValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Math.round(value * 100) / 100)
}

function isDifferent(a: number, b: number): boolean {
  return Math.abs(a - b) > EPSILON
}

export function EditNetWorthHistoryDialog() {
  const router = useRouter()
  const { currency } = useCurrency()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<EditorRow[]>([])
  const [baselineByYear, setBaselineByYear] = useState<Record<number, BaselineRow>>({})

  const currentYear = useMemo(() => new Date().getUTCFullYear(), [])

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/net-worth-history', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load net worth history')
      }

      const apiRows = (result.rows || []) as ApiRow[]
      const nextRows: EditorRow[] = apiRows.map((row) => {
        const personal = currency === 'GBP' ? row.personal_gbp : row.personal_usd
        const family = currency === 'GBP' ? row.family_gbp : row.family_usd
        const trust = currency === 'GBP' ? row.trust_gbp : row.trust_usd

        return {
          id: `year-${row.year}`,
          year: String(row.year),
          personal: formatInputValue(personal),
          family: formatInputValue(family),
          trust: formatInputValue(trust),
          hasManualOverride: !!row.has_manual_override,
          isNew: false,
        }
      })

      const baseline: Record<number, BaselineRow> = {}
      apiRows.forEach((row) => {
        baseline[row.year] = {
          personal: currency === 'GBP' ? row.personal_gbp : row.personal_usd,
          family: currency === 'GBP' ? row.family_gbp : row.family_usd,
          trust: currency === 'GBP' ? row.trust_gbp : row.trust_usd,
        }
      })

      setRows(nextRows)
      setBaselineByYear(baseline)
    } catch (error: any) {
      console.error('EditNetWorthHistoryDialog load error:', error)
      toast.error(error.message || 'Failed to load net worth history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currency])

  const addYear = () => {
    const existingYears = new Set(rows.map((row) => Number(row.year)))
    let candidate = currentYear - 1
    while (existingYears.has(candidate)) {
      candidate -= 1
    }

    setRows((prev) => [
      {
        id: `new-${Date.now()}`,
        year: String(candidate),
        personal: '0',
        family: '0',
        trust: '0',
        hasManualOverride: false,
        isNew: true,
      },
      ...prev,
    ])
  }

  const removeNewRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  const updateCell = (id: string, field: 'year' | 'personal' | 'family' | 'trust', value: string) => {
    setRows((prev) => prev.map((row) => (
      row.id === id ? { ...row, [field]: value } : row
    )))
  }

  const save = async () => {
    const dedupedByYear = new Map<number, { personal: number; family: number; trust: number }>()

    for (const row of rows) {
      const year = Number(row.year)
      const personal = parseNumericInput(row.personal)
      const family = parseNumericInput(row.family)
      const trust = parseNumericInput(row.trust)

      if (!Number.isInteger(year)) {
        toast.error(`Invalid year: ${row.year}`)
        return
      }
      if (year >= currentYear) {
        toast.error(`Year ${year} is not historical. Use years before ${currentYear}.`)
        return
      }
      if ([personal, family, trust].some((value) => Number.isNaN(value))) {
        toast.error(`Invalid amount for year ${year}`)
        return
      }

      dedupedByYear.set(year, { personal, family, trust })
    }

    const changedRows: Array<{ year: number; personal: number; family: number; trust: number }> = []
    for (const [year, values] of dedupedByYear.entries()) {
      const baseline = baselineByYear[year]
      if (!baseline) {
        changedRows.push({ year, ...values })
        continue
      }
      if (
        isDifferent(values.personal, baseline.personal) ||
        isDifferent(values.family, baseline.family) ||
        isDifferent(values.trust, baseline.trust)
      ) {
        changedRows.push({ year, ...values })
      }
    }

    if (changedRows.length === 0) {
      toast.message('No historical net worth changes to save')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/net-worth-history', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currency,
          rows: changedRows,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save net worth history')
      }

      toast.success('Historical net worth updated')
      setOpen(false)
      router.refresh()
    } catch (error: any) {
      console.error('EditNetWorthHistoryDialog save error:', error)
      toast.error(error.message || 'Failed to save historical net worth')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-2 h-4 w-4" />
          Edit History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Historical Net Worth</DialogTitle>
          <DialogDescription>
            Update yearly Personal, Family, and Trust totals for historical years.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">
              Values are saved in {currency}. Only years before {currentYear} are editable.
            </Label>
            <Button type="button" variant="outline" size="sm" onClick={addYear}>
              <Plus className="mr-2 h-4 w-4" />
              Add Year
            </Button>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[110px]">Year</TableHead>
                  <TableHead>Personal ({currency})</TableHead>
                  <TableHead>Family ({currency})</TableHead>
                  <TableHead>Trust ({currency})</TableHead>
                  <TableHead className="w-[120px]">Source</TableHead>
                  <TableHead className="w-[60px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Loading history...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No historical years found. Add a year to create manual history.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Input
                          value={row.year}
                          onChange={(e) => updateCell(row.id, 'year', e.target.value)}
                          inputMode="numeric"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.personal}
                          onChange={(e) => updateCell(row.id, 'personal', e.target.value)}
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.family}
                          onChange={(e) => updateCell(row.id, 'family', e.target.value)}
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.trust}
                          onChange={(e) => updateCell(row.id, 'trust', e.target.value)}
                          inputMode="decimal"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.hasManualOverride ? 'Manual' : 'Generated'}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.isNew && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => removeNewRow(row.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
