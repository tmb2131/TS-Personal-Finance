'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RecurringPayment } from '@/lib/types'
import { useCurrency } from '@/lib/contexts/currency-context'
import { queryKeys } from '@/lib/query-keys'

interface EditRecurringPaymentDialogProps {
  payment: RecurringPayment
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditRecurringPaymentDialog({ payment, open, onOpenChange }: EditRecurringPaymentDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { currency, fxRate } = useCurrency()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Show amount in active currency
  const initialAmount = currency === 'USD'
    ? (payment.annualized_amount_usd ?? (payment.annualized_amount_gbp ?? 0) * (fxRate || 1))
    : (payment.annualized_amount_gbp ?? (payment.annualized_amount_usd ?? 0) / (fxRate || 1))

  const [name, setName] = useState(payment.name)
  const [amount, setAmount] = useState(String(Math.round(initialAmount * 100) / 100)) // annualized (source of truth)
  const [notes, setNotes] = useState(payment.notes ?? '')

  useEffect(() => {
    if (open) {
      setName(payment.name)
      setNotes(payment.notes ?? '')
      const initial = currency === 'USD'
        ? (payment.annualized_amount_usd ?? (payment.annualized_amount_gbp ?? 0) * (fxRate || 1))
        : (payment.annualized_amount_gbp ?? (payment.annualized_amount_usd ?? 0) / (fxRate || 1))
      setAmount(String(Math.round(initial * 100) / 100))
    }
  }, [open, payment.id, payment.name, payment.notes, payment.annualized_amount_usd, payment.annualized_amount_gbp, currency, fxRate])

  const monthlyDisplay = amount !== '' && !isNaN(parseFloat(amount))
    ? String(parseFloat(amount) / 12)
    : ''

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
    if (isNaN(parsedAmount)) {
      toast.error('Please enter a valid amount')
      return
    }

    const amountGbp = currency === 'GBP' ? parsedAmount : parsedAmount / (fxRate || 1)
    const amountUsd = currency === 'USD' ? parsedAmount : parsedAmount * (fxRate || 1)

    setSaving(true)
    try {
      const res = await fetch(`/api/recurring/${payment.id}`, {
        method: 'PATCH',
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
        toast.error(result.error || 'Failed to update payment')
        return
      }

      toast.success('Payment updated')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.recurring })
      router.refresh()
    } catch {
      toast.error('Failed to update payment')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/recurring/${payment.id}`, { method: 'DELETE' })
      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to delete payment')
        return
      }

      toast.success('Payment deleted')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.recurring })
      router.refresh()
    } catch {
      toast.error('Failed to delete payment')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Recurring Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="edit-recurring-name">Payment Name</Label>
            <Input
              id="edit-recurring-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-recurring-notes">Notes</Label>
            <textarea
              id="edit-recurring-notes"
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
                <Label htmlFor="edit-recurring-monthly" className="text-xs text-muted-foreground">
                  Monthly
                </Label>
                <Input
                  id="edit-recurring-monthly"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={monthlyDisplay}
                  onChange={(e) => onMonthlyChange(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="edit-recurring-amount" className="text-xs text-muted-foreground">
                  Annualized
                </Label>
                <Input
                  id="edit-recurring-amount"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => onAnnualizedChange(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={saving || deleting}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
