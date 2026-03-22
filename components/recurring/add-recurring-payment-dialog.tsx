'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
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
import { queryKeys } from '@/lib/query-keys'

interface AddRecurringPaymentDialogProps {
  triggerLabel?: string
  triggerVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  triggerSize?: 'default' | 'sm' | 'lg' | 'icon'
  triggerClassName?: string
}

export function AddRecurringPaymentDialog({
  triggerLabel = 'Add Payment',
  triggerVariant = 'outline',
  triggerSize = 'sm',
  triggerClassName,
}: AddRecurringPaymentDialogProps = {}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { currency, fxRate } = useCurrency()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('') // annualized amount (source of truth)
  const [notes, setNotes] = useState('')

  const monthlyDisplay = amount !== '' && !isNaN(parseFloat(amount))
    ? String(parseFloat(amount) / 12)
    : ''

  const resetForm = () => {
    setName('')
    setAmount('')
    setNotes('')
  }

  const onAnnualizedChange = (value: string) => {
    setAmount(value)
  }

  const onMonthlyChange = (value: string) => {
    if (value === '') {
      setAmount('')
      return
    }
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) {
      setAmount(String(parsed * 12))
    }
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
          notes: notes.trim() || null,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.recurring })
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
        <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          <Plus className="h-4 w-4 mr-1" />
          {triggerLabel}
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
            <Label htmlFor="recurring-notes">Notes (optional)</Label>
            <textarea
              id="recurring-notes"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              placeholder="e.g. renewal date, account reference"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Amount ({currency})</Label>
            <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="recurring-monthly" className="text-xs text-muted-foreground">
                Monthly
              </Label>
                <Input
                  id="recurring-monthly"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={monthlyDisplay}
                  onChange={(e) => onMonthlyChange(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="recurring-amount" className="text-xs text-muted-foreground">
                  Annualized
                </Label>
                <Input
                  id="recurring-amount"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => onAnnualizedChange(e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter either monthly or annual cost; the other updates automatically.
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
