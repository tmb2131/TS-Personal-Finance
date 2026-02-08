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

const COMMON_ACCOUNT_TYPES = ['529', 'UGMA', 'Savings', 'Checking', 'Trust', 'Other']

export function AddKidsAccountDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [childName, setChildName] = useState('')
  const [accountType, setAccountType] = useState('Savings')
  const [balanceUsd, setBalanceUsd] = useState('')
  const [notes, setNotes] = useState('')
  const [purpose, setPurpose] = useState('')

  const resetForm = () => {
    setChildName('')
    setAccountType('Savings')
    setBalanceUsd('')
    setNotes('')
    setPurpose('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!childName.trim() || !accountType.trim()) {
      toast.error('Please fill in child name and account type')
      return
    }

    const balance = parseFloat(balanceUsd)
    if (balanceUsd && isNaN(balance)) {
      toast.error('Please enter a valid balance')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/kids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_name: childName.trim(),
          account_type: accountType.trim(),
          balance_usd: balance || 0,
          notes: notes.trim() || null,
          purpose: purpose.trim() || null,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to add kids account')
        return
      }

      toast.success('Kids account added')
      resetForm()
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Failed to add kids account')
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
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Kids Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="kids-child-name">Child Name</Label>
            <Input
              id="kids-child-name"
              placeholder="e.g. Emma"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kids-account-type">Account Type</Label>
              <select
                id="kids-account-type"
                className={selectClass}
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
              >
                {COMMON_ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kids-balance">Balance (USD)</Label>
              <Input
                id="kids-balance"
                type="number"
                step="0.01"
                placeholder="0"
                value={balanceUsd}
                onChange={(e) => setBalanceUsd(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kids-purpose">Purpose</Label>
            <Input
              id="kids-purpose"
              placeholder="e.g. College fund"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kids-notes">Notes</Label>
            <Input
              id="kids-notes"
              placeholder="Optional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Adding...' : 'Add Account'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
