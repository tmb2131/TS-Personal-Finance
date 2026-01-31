'use client'

import { useEffect, useState, Fragment, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { KidsAccount } from '@/lib/types'
import { useCurrency } from '@/lib/contexts/currency-context'
import { AlertCircle } from 'lucide-react'

interface ChildSummary {
  childName: string
  totalNetWorth: number
  accountCount: number
  accountTypeCount: number
}

export function KidsAccountsOverview() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const [accounts, setAccounts] = useState<KidsAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      const accountsResult = await supabase
        .from('kids_accounts')
        .select('*')
        .order('child_name')
        .order('account_type')
        .order('date_updated', { ascending: false })

      if (accountsResult.error) {
        console.error('Error fetching kids accounts:', accountsResult.error)
        setError('Failed to load kids account data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      
      setError(null)

      // Get the most recent balance for each account (grouped by child_name, account_type, and notes)
      // This allows multiple accounts of the same type for the same child if they have different notes
      const accountsMap = new Map<string, KidsAccount>()
      const data = accountsResult.data ?? []
      data.forEach((account: KidsAccount) => {
        if (!account?.child_name || account.account_type == null) return
        const notesKey = account.notes ?? 'no-notes'
        const key = `${account.child_name}-${account.account_type}-${notesKey}`
        const existing = accountsMap.get(key)
        if (!existing || new Date(account.date_updated) > new Date(existing.date_updated)) {
          accountsMap.set(key, account)
        }
      })

      setAccounts(Array.from(accountsMap.values()))
      setLoading(false)
    }

    fetchData()
  }, [])

  const formatCurrency = useCallback((value: number) => {
    const num = Number(value)
    if (Number.isNaN(num)) return currency === 'USD' ? '$0' : '£0'
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }, [currency])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Group accounts by child
  const accountsByChild = useMemo(() => {
    const grouped = new Map<string, KidsAccount[]>()
    accounts.forEach((account) => {
      const childName = account.child_name
      if (!grouped.has(childName)) {
        grouped.set(childName, [])
      }
      grouped.get(childName)!.push(account)
    })
    return grouped
  }, [accounts])

  // Calculate summary for each child (converted to selected currency; source is USD)
  const childSummaries = useMemo(() => {
    const summaries: ChildSummary[] = []
    
    accountsByChild.forEach((childAccounts, childName) => {
      const totalNetWorth = childAccounts.reduce((sum, acc) => {
        const converted = convertAmount(Number(acc.balance_usd) || 0, 'USD', fxRate)
        return sum + converted
      }, 0)
      const accountTypes = new Set(childAccounts.map(acc => acc.account_type).filter(Boolean))
      
      summaries.push({
        childName: String(childName),
        totalNetWorth,
        accountCount: childAccounts.length,
        accountTypeCount: accountTypes.size,
      })
    })

    return summaries.sort((a, b) => a.childName.localeCompare(b.childName))
  }, [accountsByChild, fxRate, convertAmount])

  // Get unique account types for a specific child
  const getChildAccountTypes = useCallback((childAccounts: KidsAccount[]) => {
    return Array.from(new Set(childAccounts.map(acc => acc.account_type).filter(Boolean))).sort()
  }, [])

  // Calculate account type summary for a specific child (totals in selected currency)
  const getChildAccountTypeSummary = useCallback((childAccounts: KidsAccount[]) => {
    const accountTypes = getChildAccountTypes(childAccounts)
    return accountTypes.map((accountType) => {
      const typeAccounts = childAccounts.filter((acc) => acc.account_type === accountType)
      const total = typeAccounts.reduce((sum, acc) => {
        const converted = convertAmount(Number(acc.balance_usd) || 0, 'USD', fxRate)
        return sum + converted
      }, 0)
      
      return {
        accountType,
        total,
        accounts: typeAccounts,
      }
    }).filter((item) => item.total !== 0)
  }, [getChildAccountTypes, fxRate, convertAmount])

  // Calculate max balance for scaling bars
  const getMaxBalance = (items: { total: number }[]) => {
    if (items.length === 0) return 1
    return Math.max(...items.map((item) => Math.abs(item.total)), 1)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <CardTitle className="text-base">Kids Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading kids accounts"
            description={error}
          />
        </CardContent>
      </Card>
    )
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <CardTitle className="text-base">Kids Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="No kids accounts found"
            description="No kids account data available. Please sync your Google Sheet."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary Cards - One per child */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {childSummaries.map((summary) => (
          <Card key={summary.childName} className="border-2">
            <CardHeader>
              <CardTitle className="text-lg">{summary.childName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Total Net Worth</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.totalNetWorth)}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Accounts</p>
                  <p className="text-sm font-semibold">{summary.accountCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Account Types</p>
                  <p className="text-sm font-semibold">{summary.accountTypeCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Individual Child Sections */}
      {Array.from(accountsByChild.entries()).map(([childName, childAccounts]) => {
        const accountTypeSummary = getChildAccountTypeSummary(childAccounts)
        const grandTotal = accountTypeSummary.reduce((sum, item) => sum + item.total, 0)
        const maxSummaryBalance = getMaxBalance([...accountTypeSummary, { total: grandTotal }])
        
        // Group accounts by account type for the detailed table (sort by converted balance)
        const groupedByAccountType = accountTypeSummary.map((item) => {
          const sortedAccounts = [...item.accounts].sort((a, b) => {
            const convA = convertAmount(Number(a.balance_usd) || 0, 'USD', fxRate)
            const convB = convertAmount(Number(b.balance_usd) || 0, 'USD', fxRate)
            return convB - convA
          })
          return {
            accountType: item.accountType,
            accounts: sortedAccounts,
            subtotal: item.total,
          }
        })
        
        // Max balance in converted currency for bar scaling
        const maxAccountBalance = Math.max(
          ...groupedByAccountType.flatMap((group) =>
            group.accounts.map((acc) => Math.abs(convertAmount(Number(acc.balance_usd) || 0, 'USD', fxRate)))
          ),
          ...groupedByAccountType.map((group) => Math.abs(group.subtotal)),
          1
        )

        return (
          <div key={childName} className="space-y-4">
            <h2 className="text-xl font-bold">{childName}'s Accounts</h2>

            {/* Account Type Summary Table */}
            <Card>
              <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
                <CardTitle className="text-base">Account Type Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    {/* Grand Totals Row */}
                    <TableRow className="bg-muted">
                      <TableHead className="font-bold text-black">Total</TableHead>
                      <TableHead className="text-right font-bold text-black">
                        {formatCurrency(grandTotal)}
                      </TableHead>
                      <TableHead>
                        <div className="relative h-4 w-20">
                          <div
                            className="absolute h-full bg-blue-900 right-0"
                            style={{
                              width: `${Math.min((Math.abs(grandTotal) / maxSummaryBalance) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                    {/* Column Headers */}
                    <TableRow className="bg-muted">
                      <TableHead>Account Type</TableHead>
                      <TableHead className="text-right">Balance ({currency})</TableHead>
                      <TableHead className="w-24"></TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountTypeSummary.map((item) => (
                      <TableRow key={item.accountType}>
                        <TableCell className="font-medium">
                          {item.accountType}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.total)}
                        </TableCell>
                        <TableCell>
                          <div className="relative h-4 w-20">
                            <div
                              className="absolute h-full bg-blue-900 right-0"
                              style={{
                                width: `${Math.min((Math.abs(item.total) / maxSummaryBalance) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDate(
                            item.accounts.length > 0
                              ? item.accounts[0].date_updated
                              : null
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Detailed Accounts Table */}
            <Card>
              <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
                <CardTitle className="text-base">Account Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="hidden md:block relative max-h-[600px] overflow-auto border rounded-md">
                  <table className="w-full caption-bottom text-sm">
                    <TableHeader>
                      <TableRow className="border-b bg-muted">
                        <TableHead className="sticky top-0 z-20 bg-muted">Account Type</TableHead>
                        <TableHead className="sticky top-0 z-20 text-right bg-muted">Balance ({currency})</TableHead>
                        <TableHead className="sticky top-0 z-20 w-24 bg-muted"></TableHead>
                        <TableHead className="sticky top-0 z-20 bg-muted">As of Date</TableHead>
                        <TableHead className="sticky top-0 z-20 bg-muted">Purpose</TableHead>
                        <TableHead className="sticky top-0 z-20 bg-muted">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedByAccountType.map((group) => (
                        <Fragment key={String(group.accountType)}>
                          {group.accounts.map((account) => {
                            const convertedBalance = convertAmount(Number(account.balance_usd) || 0, 'USD', fxRate)
                            return (
                              <TableRow key={account.id ?? `${account.account_type}-${account.date_updated}-${account.notes ?? ''}`}>
                                <TableCell className="font-medium">{account.account_type ?? '-'}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(convertedBalance)}
                                </TableCell>
                                <TableCell>
                                  <div className="relative h-4 w-20">
                                    <div
                                      className="absolute h-full bg-blue-900 right-0"
                                      style={{
                                        width: `${Math.min((Math.abs(convertedBalance) / maxAccountBalance) * 100, 100)}%`,
                                      }}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell>{formatDate(account.date_updated ?? null)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {account.purpose ?? '-'}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {account.notes ?? '-'}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                          <TableRow key={`subtotal-${String(group.accountType)}`} className="bg-muted/50">
                            <TableCell colSpan={1} className="font-semibold">
                              {group.accountType} Subtotal
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(group.subtotal)}
                            </TableCell>
                            <TableCell>
                              <div className="relative h-4 w-20">
                                <div
                                  className="absolute h-full bg-blue-900 right-0"
                                  style={{
                                    width: `${Math.min((Math.abs(group.subtotal) / maxAccountBalance) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            </TableCell>
                            <TableCell colSpan={3}></TableCell>
                          </TableRow>
                        </Fragment>
                      ))}
                    </TableBody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
