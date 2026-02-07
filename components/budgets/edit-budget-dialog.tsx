'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
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
import { useCurrency } from '@/lib/contexts/currency-context'
import { BudgetTarget } from '@/lib/types'

const EXCLUDED_CATEGORIES = ['Excluded']

export function EditBudgetDialog() {
  const router = useRouter()
  const { currency, fxRate } = useCurrency()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [budgets, setBudgets] = useState<BudgetTarget[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const budgetField = currency === 'GBP' ? 'annual_budget_gbp' : 'annual_budget_usd'

  const fetchBudgets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/budgets')
      const result = await res.json()
      if (result.success) {
        setBudgets(result.data ?? [])
      }
    } catch {
      toast.error('Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchBudgets()
      setEditingId(null)
      setAddingNew(false)
    }
  }, [open, fetchBudgets])

  const filteredBudgets = budgets.filter(
    (b) => !EXCLUDED_CATEGORIES.includes(b.category)
  )

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value))
  }

  const startEdit = (budget: BudgetTarget) => {
    setEditingId(budget.id)
    setEditValue(String(Math.abs(budget[budgetField])))
    setAddingNew(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const saveEdit = async (budget: BudgetTarget) => {
    const amount = parseFloat(editValue)
    if (isNaN(amount)) {
      toast.error('Please enter a valid amount')
      return
    }

    // Preserve the sign: expenses are negative, income is positive
    const isIncome = budget.category === 'Income' || budget.category === 'Gift Money'
    const signedAmount = isIncome ? Math.abs(amount) : -Math.abs(amount)

    // fxRate is GBP→USD
    const gbp = currency === 'GBP' ? signedAmount : fxRate ? signedAmount / fxRate : signedAmount
    const usd = currency === 'USD' ? signedAmount : fxRate ? signedAmount * fxRate : signedAmount

    setSaving(true)
    try {
      const res = await fetch(`/api/budgets/${budget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annual_budget_gbp: Math.round(gbp * 100) / 100,
          annual_budget_usd: Math.round(usd * 100) / 100,
        }),
      })
      const result = await res.json()
      if (result.success) {
        setBudgets((prev) =>
          prev.map((b) => (b.id === budget.id ? { ...b, ...result.data } : b))
        )
        setEditingId(null)
        toast.success('Budget updated')
      } else {
        toast.error(result.error || 'Failed to update')
      }
    } catch {
      toast.error('Failed to update budget')
    } finally {
      setSaving(false)
    }
  }

  const deleteBudget = async (budget: BudgetTarget) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/budgets/${budget.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.success) {
        setBudgets((prev) => prev.filter((b) => b.id !== budget.id))
        toast.success('Budget deleted')
      } else {
        toast.error(result.error || 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete budget')
    } finally {
      setSaving(false)
    }
  }

  const addBudget = async () => {
    if (!newCategory.trim()) {
      toast.error('Please enter a category name')
      return
    }
    const amount = newAmount ? parseFloat(newAmount) : 0
    if (newAmount && isNaN(amount)) {
      toast.error('Please enter a valid amount')
      return
    }

    // New categories default to expense (negative) unless named Income/Gift Money
    const isIncome = newCategory === 'Income' || newCategory === 'Gift Money'
    const signedAmount = isIncome ? Math.abs(amount) : -Math.abs(amount)

    const gbp = currency === 'GBP' ? signedAmount : fxRate ? signedAmount / fxRate : signedAmount
    const usd = currency === 'USD' ? signedAmount : fxRate ? signedAmount * fxRate : signedAmount

    setSaving(true)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newCategory.trim(),
          annual_budget_gbp: Math.round(gbp * 100) / 100,
          annual_budget_usd: Math.round(usd * 100) / 100,
        }),
      })
      const result = await res.json()
      if (result.success) {
        setBudgets((prev) => [...prev, result.data])
        setNewCategory('')
        setNewAmount('')
        setAddingNew(false)
        toast.success('Budget added')
      } else {
        toast.error(result.error || 'Failed to add budget')
      }
    } catch {
      toast.error('Failed to add budget')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      router.refresh()
    }
  }

  // Split into income and expense categories
  const incomeCategories = filteredBudgets.filter(
    (b) => b.category === 'Income' || b.category === 'Gift Money'
  )
  const expenseCategories = filteredBudgets.filter(
    (b) => b.category !== 'Income' && b.category !== 'Gift Money'
  )

  const renderRow = (budget: BudgetTarget) => {
    const isEditing = editingId === budget.id
    const displayAmount = budget[budgetField]
    const isManual = budget.data_source === 'manual'

    return (
      <TableRow key={budget.id}>
        <TableCell className="font-medium">{budget.category}</TableCell>
        <TableCell className="text-right">
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              className="h-8 w-32 ml-auto text-right"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit(budget)
                if (e.key === 'Escape') cancelEdit()
              }}
            />
          ) : (
            <span className="tabular-nums">{formatAmount(displayAmount)}</span>
          )}
        </TableCell>
        <TableCell className="text-right w-24">
          {isEditing ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => saveEdit(budget)}
                disabled={saving}
              >
                <Check className="h-4 w-4 text-green-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={cancelEdit}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => startEdit(budget)}
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              {isManual && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => deleteBudget(budget)}
                  disabled={saving}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
          )}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1" />
          Edit Budget
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Budget</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading budgets...</div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Income Section */}
            {incomeCategories.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Income</h3>
                <Table className="[&_th]:h-8 [&_th]:px-3 [&_th]:py-1 [&_th]:text-xs [&_td]:h-9 [&_td]:px-3 [&_td]:py-1 [&_td]:text-sm">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Annual ({currency})</TableHead>
                      <TableHead className="text-right w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeCategories.map(renderRow)}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Expenses Section */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Expenses</h3>
              <Table className="[&_th]:h-8 [&_th]:px-3 [&_th]:py-1 [&_th]:text-xs [&_td]:h-9 [&_td]:px-3 [&_td]:py-1 [&_td]:text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Annual ({currency})</TableHead>
                    <TableHead className="text-right w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseCategories.length === 0 && !addingNew ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                        No expense budgets yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenseCategories.map(renderRow)
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Add New Row */}
            {addingNew ? (
              <div className="flex items-end gap-2 pt-2 border-t">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <Input
                    placeholder="Category name"
                    className="h-8"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addBudget()
                      if (e.key === 'Escape') { setAddingNew(false); setNewCategory(''); setNewAmount('') }
                    }}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Annual ({currency})</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    className="h-8 text-right"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addBudget()
                      if (e.key === 'Escape') { setAddingNew(false); setNewCategory(''); setNewAmount('') }
                    }}
                  />
                </div>
                <Button size="sm" className="h-8" onClick={addBudget} disabled={saving}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => { setAddingNew(false); setNewCategory(''); setNewAmount('') }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { setAddingNew(true); setEditingId(null) }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Category
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
