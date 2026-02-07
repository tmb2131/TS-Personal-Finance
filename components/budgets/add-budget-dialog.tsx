'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useCurrency } from '@/lib/contexts/currency-context'

export function AddBudgetDialog() {
  const router = useRouter()
  const { currency, fxRate } = useCurrency()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [category, setCategory] = useState('')
  const [annualBudget, setAnnualBudget] = useState('')

  const resetForm = () => {
    setCategory('')
    setAnnualBudget('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!category) {
      toast.error('Please enter a category')
      return
    }

    const amount = annualBudget ? parseFloat(annualBudget) : 0

    if (annualBudget && isNaN(amount)) {
      toast.error('Please enter a valid budget amount')
      return
    }

    if (amount === 0) {
      toast.error('Please enter a budget amount')
      return
    }

    // fxRate is GBP→USD: GBP * fxRate = USD
    const gbp = currency === 'GBP' ? amount : fxRate ? amount / fxRate : amount
    const usd = currency === 'USD' ? amount : fxRate ? amount * fxRate : amount

    setSaving(true)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          annual_budget_gbp: Math.round(gbp * 100) / 100,
          annual_budget_usd: Math.round(usd * 100) / 100,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to add budget')
        return
      }

      toast.success('Budget added')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch {
      toast.error('Failed to add budget')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Budget
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Budget Target</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="budget-category">Category</Label>
            <Input
              id="budget-category"
              placeholder="e.g. Food & Drink, Transport"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget-amount">Annual Budget ({currency})</Label>
            <Input
              id="budget-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={annualBudget}
              onChange={(e) => setAnnualBudget(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Add Budget'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
