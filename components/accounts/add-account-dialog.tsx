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

const ACCOUNT_CATEGORIES = ['Cash', 'Brokerage', 'Alt Inv', 'Retirement', 'Property', 'Trust', 'Other']
const LIQUIDITY_PROFILES = ['Instant', 'Within 6 Months', 'Locked Up']

export function AddAccountDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [institution, setInstitution] = useState('')
  const [accountName, setAccountName] = useState('')
  const [category, setCategory] = useState('Cash')
  const [currency, setCurrency] = useState<'USD' | 'GBP' | 'EUR'>('USD')
  const [balance, setBalance] = useState('')
  const [liquidityProfile, setLiquidityProfile] = useState('')
  const [riskProfile, setRiskProfile] = useState('')
  const [horizonProfile, setHorizonProfile] = useState('')

  const resetForm = () => {
    setInstitution('')
    setAccountName('')
    setCategory('Cash')
    setCurrency('USD')
    setBalance('')
    setLiquidityProfile('')
    setRiskProfile('')
    setHorizonProfile('')
  }

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
      const res = await fetch('/api/accounts', {
        method: 'POST',
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
        toast.error(result.error || 'Failed to add account')
        return
      }

      toast.success('Account added')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch {
      toast.error('Failed to add account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="acc-institution">Institution</Label>
            <Input
              id="acc-institution"
              placeholder="e.g. Chase, Barclays"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-name">Account Name</Label>
            <Input
              id="acc-name"
              placeholder="e.g. Checking, ISA"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acc-category">Category</Label>
              <select
                id="acc-category"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {ACCOUNT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-currency">Currency</Label>
              <select
                id="acc-currency"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <Label htmlFor="acc-balance">Balance</Label>
            <Input
              id="acc-balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-liquidity">Liquidity Profile</Label>
            <select
              id="acc-liquidity"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={liquidityProfile}
              onChange={(e) => setLiquidityProfile(e.target.value)}
            >
              <option value="">— Select —</option>
              {LIQUIDITY_PROFILES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acc-risk">Risk Profile</Label>
              <Input
                id="acc-risk"
                placeholder="e.g. Low, Medium, High"
                value={riskProfile}
                onChange={(e) => setRiskProfile(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-horizon">Horizon Profile</Label>
              <Input
                id="acc-horizon"
                placeholder="e.g. Short, Long"
                value={horizonProfile}
                onChange={(e) => setHorizonProfile(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Add Account'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
