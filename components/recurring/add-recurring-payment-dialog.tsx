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

export function AddRecurringPaymentDialog() {
  const router = useRouter()
  const { currency, fxRate } = useCurrency()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  const resetForm = () => {
    setName('')
    setAmount('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Please enter a payment name')
      return
    }

    const parsedAmount = parseFloat(amount)
    if (!amount || isNaN(parsedAmount)) {
      toast.error('Please enter a valid annualized amount')
      return
    }

    // Convert display amount to both GBP and USD for storage
    const amountGbp = currency === 'GBP' ? parsedAmount : parsedAmount / (fxRate || 1)
    const amountUsd = currency === 'USD' ? parsedAmount : parsedAmount * (fxRate || 1)

    setSaving(true)
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          annualized_amount_gbp: Math.round(amountGbp * 100) / 100,
          annualized_amount_usd: Math.round(amountUsd * 100) / 100,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to add recurring payment')
        return
      }

      toast.success('Recurring payment added')
      resetForm()
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Failed to add recurring payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Recurring Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="recurring-name">Payment Name</Label>
            <Input
              id="recurring-name"
              placeholder="e.g. Netflix, Gym Membership"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-amount">Annualized Amount ({currency})</Label>
            <Input
              id="recurring-amount"
              type="number"
              step="0.01"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the total annual cost (e.g. $120/year for a $10/month subscription)
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Adding...' : 'Add Payment'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
