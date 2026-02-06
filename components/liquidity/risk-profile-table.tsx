'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useCurrency } from '@/lib/contexts/currency-context'
import { AlertCircle, ListIcon } from 'lucide-react'

const RISK_COLORS: Record<string, string> = {
  Conservative: '#10b981',
  Moderate: '#3b82f6',
  Aggressive: '#ef4444',
  Unknown: '#94a3b8',
}

interface RiskGroup {
  profile: string
  accounts: AccountBalance[]
  total: number
}

export default function RiskProfileTable() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<RiskGroup[]>([])
  const [grandTotal, setGrandTotal] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      const { data: accounts } = await supabase
        .from('account_balances')
        .select('*')
        .order('date_updated', { ascending: false })

      if (!accounts) {
        setLoading(false)
        return
      }

      // Deduplicate by institution + account_name
      const accountsMap = new Map<string, AccountBalance>()
      accounts.forEach((account) => {
        const key = `${account.institution}-${account.account_name}`
        const existing = accountsMap.get(key)
        if (
          !existing ||
          new Date(account.date_updated) > new Date(existing.date_updated)
        ) {
          accountsMap.set(key, account)
        }
      })

      const latestAccounts = Array.from(accountsMap.values())

      // Group by risk_profile
      const groupMap = new Map<string, AccountBalance[]>()
      latestAccounts.forEach((account) => {
        const profile = account.risk_profile || 'Unknown'
        const existing = groupMap.get(profile) || []
        existing.push(account)
        groupMap.set(profile, existing)
      })

      let total = 0
      const riskGroups: RiskGroup[] = []

      groupMap.forEach((accts, profile) => {
        const groupTotal = accts.reduce((sum, acc) => {
          return sum + convertAmount(acc.balance_total_local ?? 0, acc.currency ?? 'USD', fxRate)
        }, 0)
        total += groupTotal
        riskGroups.push({ profile, accounts: accts, total: groupTotal })
      })

      // Sort by total descending
      riskGroups.sort((a, b) => b.total - a.total)

      setGroups(riskGroups)
      setGrandTotal(total)
      setLoading(false)
    }

    fetchData()
  }, [currency, convertAmount, fxRate])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Profile Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Profile Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2" style={{ height: 200 }}>
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Risk Profile Breakdown</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <ListIcon className="h-4 w-4 mr-2" />
              View Details
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Accounts by Risk Profile</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-6">
              {groups.map((group) => (
                <div key={group.profile}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: RISK_COLORS[group.profile] || RISK_COLORS.Unknown }}
                    />
                    <h4 className="font-medium text-sm">{group.profile}</h4>
                    <span className="text-sm text-muted-foreground ml-auto tabular-nums">
                      {formatCurrency(group.total)}
                    </span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Institution</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.accounts
                        .sort((a, b) => {
                          const balA = convertAmount(a.balance_total_local ?? 0, a.currency ?? 'USD', fxRate)
                          const balB = convertAmount(b.balance_total_local ?? 0, b.currency ?? 'USD', fxRate)
                          return balB - balA
                        })
                        .map((account, idx) => {
                          const balance = convertAmount(
                            account.balance_total_local ?? 0,
                            account.currency ?? 'USD',
                            fxRate
                          )
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{account.institution}</TableCell>
                              <TableCell>{account.account_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{account.currency}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(balance)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Risk Profile</TableHead>
              <TableHead className="text-right"># Accounts</TableHead>
              <TableHead className="text-right">Total Value</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.profile}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: RISK_COLORS[group.profile] || RISK_COLORS.Unknown }}
                    />
                    <span className="font-medium">{group.profile}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{group.accounts.length}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(group.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {grandTotal > 0 ? `${((group.total / grandTotal) * 100).toFixed(1)}%` : '–'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">
                {groups.reduce((sum, g) => sum + g.accounts.length, 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(grandTotal)}
              </TableCell>
              <TableCell className="text-right">100%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
