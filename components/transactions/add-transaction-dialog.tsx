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

export function AddTransactionDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'GBP'>('USD')

  const resetForm = () => {
    setDate(today)
    setCategory('')
    setCounterparty('')
    setAmount('')
    setCurrency('USD')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!date || !category || !amount) {
      toast.error('Please fill in date, category, and amount')
      return
    }

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount)) {
      toast.error('Please enter a valid amount')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          category,
          counterparty: counterparty || null,
          amount_usd: currency === 'USD' ? numAmount : null,
          amount_gbp: currency === 'GBP' ? numAmount : null,
          currency,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to add transaction')
        return
      }

      toast.success('Transaction added')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch {
      toast.error('Failed to add transaction')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Transaction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="txn-date">Date</Label>
            <Input
              id="txn-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="txn-category">Category</Label>
            <Input
              id="txn-category"
              placeholder="e.g. Food & Drink, Transport"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="txn-counterparty">Counterparty</Label>
            <Input
              id="txn-counterparty"
              placeholder="e.g. Tesco, Uber"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="txn-amount">Amount</Label>
              <Input
                id="txn-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="txn-currency">Currency</Label>
              <select
                id="txn-currency"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'USD' | 'GBP')}
              >
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Add Transaction'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
