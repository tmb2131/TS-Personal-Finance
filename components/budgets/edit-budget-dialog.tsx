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
import { BudgetTarget, InvestmentReturn } from '@/lib/types'

const EXCLUDED_CATEGORIES = ['Excluded']

export function EditBudgetDialog() {
  const router = useRouter()
  const { currency, fxRate, convertAmount } = useCurrency()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [budgets, setBudgets] = useState<BudgetTarget[]>([])
  const [investmentReturns, setInvestmentReturns] = useState<InvestmentReturn[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingInvestmentId, setEditingInvestmentId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [addingNewInvestment, setAddingNewInvestment] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newInvestmentSource, setNewInvestmentSource] = useState('')
  const [newInvestmentAmount, setNewInvestmentAmount] = useState('')
  const [saving, setSaving] = useState(false)

  // Match Dashboard logic: always read from GBP and convert to display currency
  const getDisplayAmount = (budget: BudgetTarget) => {
    const raw = currency === 'USD'
      ? convertAmount(budget.annual_budget_gbp, 'GBP', fxRate)
      : budget.annual_budget_gbp
    return Math.round(raw)
  }

  // Convert investment return GBP amount to display currency
  const getInvestmentDisplayAmount = (ir: InvestmentReturn) => {
    const raw = currency === 'USD'
      ? convertAmount(ir.amount_gbp || 0, 'GBP', fxRate)
      : (ir.amount_gbp || 0)
    return Math.round(raw)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [budgetRes, investmentRes] = await Promise.all([
        fetch('/api/budgets'),
        fetch('/api/investment-returns'),
      ])
      const budgetResult = await budgetRes.json()
      const investmentResult = await investmentRes.json()
      if (budgetResult.success) {
        setBudgets(budgetResult.data ?? [])
      }
      if (investmentResult.success) {
        setInvestmentReturns(investmentResult.data ?? [])
      }
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchData()
      setEditingId(null)
      setEditingInvestmentId(null)
      setAddingNew(false)
      setAddingNewInvestment(false)
    }
  }, [open, fetchData])

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
    setEditingInvestmentId(null)
    setEditValue(String(Math.abs(getDisplayAmount(budget))))
    setAddingNew(false)
    setAddingNewInvestment(false)
  }

  const startInvestmentEdit = (ir: InvestmentReturn) => {
    setEditingInvestmentId(ir.id)
    setEditingId(null)
    setEditValue(String(Math.abs(getInvestmentDisplayAmount(ir))))
    setAddingNew(false)
    setAddingNewInvestment(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingInvestmentId(null)
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

  const saveInvestmentEdit = async (ir: InvestmentReturn) => {
    const amount = parseFloat(editValue)
    if (isNaN(amount)) {
      toast.error('Please enter a valid amount')
      return
    }

    // Convert display currency back to GBP for storage
    const gbpAmount = currency === 'GBP' ? amount : fxRate ? amount / fxRate : amount

    setSaving(true)
    try {
      const res = await fetch(`/api/investment-returns/${ir.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_gbp: Math.round(gbpAmount * 100) / 100,
        }),
      })
      const result = await res.json()
      if (result.success) {
        setInvestmentReturns((prev) =>
          prev.map((r) => (r.id === ir.id ? { ...r, ...result.data } : r))
        )
        setEditingInvestmentId(null)
        toast.success('Investment return updated')
      } else {
        toast.error(result.error || 'Failed to update')
      }
    } catch {
      toast.error('Failed to update investment return')
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

  const deleteInvestmentReturn = async (ir: InvestmentReturn) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/investment-returns/${ir.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.success) {
        setInvestmentReturns((prev) => prev.filter((r) => r.id !== ir.id))
        toast.success('Investment return deleted')
      } else {
        toast.error(result.error || 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete investment return')
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

  const addInvestmentReturn = async () => {
    if (!newInvestmentSource.trim()) {
      toast.error('Please enter an income source name')
      return
    }
    const amount = newInvestmentAmount ? parseFloat(newInvestmentAmount) : 0
    if (newInvestmentAmount && isNaN(amount)) {
      toast.error('Please enter a valid amount')
      return
    }

    // Convert display currency back to GBP for storage
    const gbpAmount = currency === 'GBP' ? amount : fxRate ? amount / fxRate : amount

    setSaving(true)
    try {
      const res = await fetch('/api/investment-returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          income_source: newInvestmentSource.trim(),
          amount_gbp: Math.round(gbpAmount * 100) / 100,
        }),
      })
      const result = await res.json()
      if (result.success) {
        setInvestmentReturns((prev) => [...prev, result.data])
        setNewInvestmentSource('')
        setNewInvestmentAmount('')
        setAddingNewInvestment(false)
        toast.success('Investment return added')
      } else {
        toast.error(result.error || 'Failed to add investment return')
      }
    } catch {
      toast.error('Failed to add investment return')
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
    const displayAmount = getDisplayAmount(budget)
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

  const renderInvestmentRow = (ir: InvestmentReturn) => {
    const isEditing = editingInvestmentId === ir.id
    const displayAmount = getInvestmentDisplayAmount(ir)

    return (
      <TableRow key={ir.id}>
        <TableCell className="font-medium">{ir.income_source}</TableCell>
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
                if (e.key === 'Enter') saveInvestmentEdit(ir)
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
                onClick={() => saveInvestmentEdit(ir)}
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
                onClick={() => startInvestmentEdit(ir)}
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => deleteInvestmentReturn(ir)}
                disabled={saving}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
    )
  }

  const tableClass = '[&_th]:h-8 [&_th]:px-3 [&_th]:py-1 [&_th]:text-xs [&_td]:h-9 [&_td]:px-3 [&_td]:py-1 [&_td]:text-sm'

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
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Income Section */}
            {incomeCategories.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Income</h3>
                <Table className={tableClass}>
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
              <Table className={tableClass}>
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

            {/* Add New Budget Row */}
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
                onClick={() => { setAddingNew(true); setAddingNewInvestment(false); setEditingId(null); setEditingInvestmentId(null) }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Category
              </Button>
            )}

            {/* Est. Investment Return Section */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Est. Investment Return</h3>
              <Table className={tableClass}>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Income Source</TableHead>
                    <TableHead className="text-right">Annual ({currency})</TableHead>
                    <TableHead className="text-right w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investmentReturns.length === 0 && !addingNewInvestment ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                        No investment returns yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    investmentReturns.map(renderInvestmentRow)
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Add New Investment Return Row */}
            {addingNewInvestment ? (
              <div className="flex items-end gap-2 pt-2 border-t">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Income Source</label>
                  <Input
                    placeholder="e.g. Dividends"
                    className="h-8"
                    value={newInvestmentSource}
                    onChange={(e) => setNewInvestmentSource(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addInvestmentReturn()
                      if (e.key === 'Escape') { setAddingNewInvestment(false); setNewInvestmentSource(''); setNewInvestmentAmount('') }
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
                    value={newInvestmentAmount}
                    onChange={(e) => setNewInvestmentAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addInvestmentReturn()
                      if (e.key === 'Escape') { setAddingNewInvestment(false); setNewInvestmentSource(''); setNewInvestmentAmount('') }
                    }}
                  />
                </div>
                <Button size="sm" className="h-8" onClick={addInvestmentReturn} disabled={saving}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => { setAddingNewInvestment(false); setNewInvestmentSource(''); setNewInvestmentAmount('') }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { setAddingNewInvestment(true); setAddingNew(false); setEditingId(null); setEditingInvestmentId(null) }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Investment Return
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
