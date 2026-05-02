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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { KidsAccount } from '@/lib/types'
import { queryKeys } from '@/lib/query-keys'

const COMMON_ACCOUNT_TYPES = ['529', 'UGMA', 'Savings', 'Checking', 'Trust', 'Other']

function toDateInputValue(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10)
  return value.slice(0, 10)
}

interface EditKidsAccountDialogProps {
  account: KidsAccount
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditKidsAccountDialog({ account, open, onOpenChange }: EditKidsAccountDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const [childName, setChildName] = useState(account.child_name)
  const [accountType, setAccountType] = useState(account.account_type)
  const [lastUpdated, setLastUpdated] = useState(toDateInputValue(account.date_updated))
  const [balanceUsd, setBalanceUsd] = useState(String(account.balance_usd))
  const [notes, setNotes] = useState(account.notes ?? '')
  const [purpose, setPurpose] = useState(account.purpose ?? '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!childName.trim() || !accountType.trim()) {
      toast.error('Please fill in child name and account type')
      return
    }

    if (!lastUpdated) {
      toast.error('Please select a last updated date')
      return
    }

    const balance = parseFloat(balanceUsd)
    if (isNaN(balance)) {
      toast.error('Please enter a valid balance')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/kids/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_name: childName.trim(),
          account_type: accountType.trim(),
          date_updated: lastUpdated,
          balance_usd: balance,
          notes: notes.trim() || null,
          purpose: purpose.trim() || null,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to update account')
        return
      }

      toast.success('Account updated')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.kids })
      router.refresh()
    } catch {
      toast.error('Failed to update account')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/kids/${account.id}`, { method: 'DELETE' })
      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to delete account')
        return
      }

      toast.success('Account deleted')
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.kids })
      router.refresh()
    } catch {
      toast.error('Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Kids Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="edit-kids-child-name">Child Name</Label>
            <Input
              id="edit-kids-child-name"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-kids-account-type">Account Type</Label>
              <select
                id="edit-kids-account-type"
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
              <Label htmlFor="edit-kids-balance">Balance (USD)</Label>
              <Input
                id="edit-kids-balance"
                type="number"
                step="0.01"
                value={balanceUsd}
                onChange={(e) => setBalanceUsd(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-kids-date-updated">Last Updated</Label>
            <Input
              id="edit-kids-date-updated"
              type="date"
              value={lastUpdated}
              onChange={(e) => setLastUpdated(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-kids-purpose">Purpose</Label>
            <Input
              id="edit-kids-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-kids-notes">Notes</Label>
            <Input
              id="edit-kids-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={saving || deleting}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={saving || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </form>
      </DialogContent>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete kids account?"
        description={
          <>
            This will permanently remove <strong>{account.child_name}</strong>'s{' '}
            <strong>{account.account_type}</strong> account. This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </Dialog>
  )
}
