'use client'

import { useState } from 'react'
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
import { Debt } from '@/lib/types'
import { useCurrency } from '@/lib/contexts/currency-context'
import { queryKeys } from '@/lib/query-keys'

const DEBT_TYPES = ['Mortgage', 'Credit Card', 'Personal Loan', 'Committed Capital', 'Other']

interface EditDebtDialogProps {
  debt: Debt
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditDebtDialog({ debt, open, onOpenChange }: EditDebtDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { currency, fxRate } = useCurrency()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const initialAmount = currency === 'USD'
    ? (debt.amount_usd ?? (debt.amount_gbp ?? 0) * (fxRate || 1))
    : (debt.amount_gbp ?? (debt.amount_usd ?? 0) / (fxRate || 1))

  const [type, setType] = useState(debt.type)
  const [name, setName] = useState(debt.name)
  const [purpose, setPurpose] = useState(debt.purpose ?? '')
  const [amount, setAmount] = useState(String(Math.round(initialAmount * 100) / 100))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Please enter a name')
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
      const res = await fetch(`/api/debt/${debt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type.trim(),
          name: name.trim(),
          purpose: purpose.trim() || null,
          amount_gbp: Math.round(amountGbp * 100) / 100,
          amount_usd: Math.round(amountUsd * 100) / 100,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to update debt entry')
        return
      }

      toast.success('Debt entry updated')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.debt })
      router.refresh()
    } catch {
      toast.error('Failed to update debt entry')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/debt/${debt.id}`, { method: 'DELETE' })
      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to delete debt entry')
        return
      }

      toast.success('Debt entry deleted')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.debt })
      router.refresh()
    } catch {
      toast.error('Failed to delete debt entry')
    } finally {
      setDeleting(false)
    }
  }

  const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Debt Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-debt-type">Type</Label>
              <select
                id="edit-debt-type"
                className={selectClass}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {DEBT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-debt-amount">Amount ({currency})</Label>
              <Input
                id="edit-debt-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-debt-name">Name</Label>
            <Input
              id="edit-debt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-debt-purpose">Purpose</Label>
            <Input
              id="edit-debt-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
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
