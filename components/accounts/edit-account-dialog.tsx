'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { AccountBalance } from '@/lib/types'

const ACCOUNT_CATEGORIES = ['Cash', 'Brokerage', 'Alt Inv', 'Retirement', 'Property', 'Trust', 'Other']
const LIQUIDITY_PROFILES = ['Instant', 'Within 6 Months', 'Locked Up']

interface EditAccountDialogProps {
  account: AccountBalance
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditAccountDialog({ account, open, onOpenChange }: EditAccountDialogProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [institution, setInstitution] = useState(account.institution)
  const [accountName, setAccountName] = useState(account.account_name)
  const [category, setCategory] = useState(account.category)
  const [currency, setCurrency] = useState(account.currency)
  const [balance, setBalance] = useState(String(account.balance_total_local))
  const [liquidityProfile, setLiquidityProfile] = useState(account.liquidity_profile ?? '')
  const [riskProfile, setRiskProfile] = useState(account.risk_profile ?? '')
  const [horizonProfile, setHorizonProfile] = useState(account.horizon_profile ?? '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!institution || !accountName || !balance) {
      toast.error('Please fill in institution, account name, and balance')
      return
    }

    const numBalance = parseFloat(balance)
    if (isNaN(numBalance)) {
      toast.error('Please enter a valid balance')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution,
          account_name: accountName,
          category,
          currency,
          balance_total_local: numBalance,
          balance_personal_local: numBalance,
          balance_family_local: 0,
          liquidity_profile: liquidityProfile || null,
          risk_profile: riskProfile || null,
          horizon_profile: horizonProfile || null,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to update account')
        return
      }

      toast.success('Account updated')
      onOpenChange(false)
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
      const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
      const result = await res.json()

      if (!result.success) {
        toast.error(result.error || 'Failed to delete account')
        return
      }

      toast.success('Account deleted')
      onOpenChange(false)
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
          <DialogTitle>Edit Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="edit-acc-institution">Institution</Label>
            <Input
              id="edit-acc-institution"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-acc-name">Account Name</Label>
            <Input
              id="edit-acc-name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-acc-category">Category</Label>
              <select
                id="edit-acc-category"
                className={selectClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {ACCOUNT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-acc-currency">Currency</Label>
              <select
                id="edit-acc-currency"
                className={selectClass}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'USD' | 'GBP' | 'EUR')}
              >
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-acc-balance">Balance</Label>
            <Input
              id="edit-acc-balance"
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-acc-liquidity">Liquidity Profile</Label>
            <select
              id="edit-acc-liquidity"
              className={selectClass}
              value={liquidityProfile}
              onChange={(e) => setLiquidityProfile(e.target.value)}
            >
              <option value="">-- Select --</option>
              {LIQUIDITY_PROFILES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-acc-risk">Risk Profile</Label>
              <Input
                id="edit-acc-risk"
                value={riskProfile}
                onChange={(e) => setRiskProfile(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-acc-horizon">Horizon Profile</Label>
              <Input
                id="edit-acc-horizon"
                value={horizonProfile}
                onChange={(e) => setHorizonProfile(e.target.value)}
              />
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
