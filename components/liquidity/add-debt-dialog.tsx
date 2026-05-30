'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getClientTimeZone } from '@/lib/date-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useCurrency } from '@/lib/contexts/currency-context'
import { queryKeys } from '@/lib/query-keys'

const DEBT_TYPES = ['Mortgage', 'Credit Card', 'Personal Loan', 'Committed Capital', 'Other']

export function AddDebtDialog() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { currency, fxRate } = useCurrency()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [type, setType] = useState('Mortgage')
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [amount, setAmount] = useState('')

  const resetForm = () => {
    setType('Mortgage')
    setName('')
    setPurpose('')
    setAmount('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Please enter a name')
      return
    }

    const parsedAmount = parseFloat(amount)
    if (!amount || isNaN(parsedAmount)) {
      toast.error('Please enter a valid amount')
      return
    }

    // Convert display amount to both GBP and USD for storage
    const amountGbp = currency === 'GBP' ? parsedAmount : parsedAmount / (fxRate || 1)
    const amountUsd = currency === 'USD' ? parsedAmount : parsedAmount * (fxRate || 1)

    setSaving(true)
    try {
      const res = await fetch('/api/debt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-timezone': getClientTimeZone() ?? '' },
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
        toast.error(result.error || 'Failed to add debt entry')
        return
      }

      toast.success('Debt entry added')
      resetForm()
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.debt })
      router.refresh()
    } catch {
      toast.error('Failed to add debt entry')
    } finally {
      setSaving(false)
    }
  }

  const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Debt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Debt / Committed Capital</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="debt-type">Type</Label>
              <select
                id="debt-type"
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
              <Label htmlFor="debt-amount">Amount ({currency})</Label>
              <Input
                id="debt-amount"
                type="number"
                step="0.01"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="debt-name">Name</Label>
            <Input
              id="debt-name"
              placeholder="e.g. Home Mortgage, Car Loan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="debt-purpose">Purpose</Label>
            <Input
              id="debt-purpose"
              placeholder="e.g. Primary residence"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Adding...' : 'Add Entry'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
