'use client'

import { useEffect, useState, Fragment, useMemo } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { KPICard } from '@/components/kpi-card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance, FXRateCurrent } from '@/lib/types'
import { AlertCircle } from 'lucide-react'

const CATEGORIES = ['Cash', 'Brokerage', 'Alt Inv', 'Retirement', 'Taconic', 'House', 'Trust']

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'Cash': 'Cash',
  'Brokerage': 'Brokerage',
  'Alt Inv': 'Alternative Investment',
  'Retirement': 'Retirement',
  'Taconic': 'Taconic',
  'House': 'House',
  'Trust': 'Trust',
}

// Normalize category names from database to standard category names
const normalizeCategory = (category: string): string => {
  const normalized = category.trim()
  
  // Map variations of "Alternative Investment" to "Alt Inv"
  if (normalized.toLowerCase().includes('alternative') || 
      normalized.toLowerCase().includes('alt inv') ||
      normalized.toLowerCase().startsWith('alt')) {
    return 'Alt Inv'
  }
  
  // Map exact matches for other categories
  if (CATEGORIES.includes(normalized)) {
    return normalized
  }
  
  // Try case-insensitive match
  const lowerNormalized = normalized.toLowerCase()
  for (const cat of CATEGORIES) {
    if (cat.toLowerCase() === lowerNormalized) {
      return cat
    }
  }
  
  // Return original if no match found
  return normalized
}

export function AccountsOverview() {
  const { currency, convertAmount } = useCurrency()
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [fxRate, setFxRate] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      const [accountsResult, fxResult] = await Promise.all([
        supabase
          .from('account_balances')
          .select('*')
          .order('category')
          .order('institution'),
        supabase
          .from('fx_rate_current')
          .select('*')
          .order('date', { ascending: false })
          .limit(1)
          .single(),
      ])

      if (accountsResult.error) {
        console.error('Error fetching accounts:', accountsResult.error)
        setError('Failed to load account data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      
      setError(null)

      if (fxResult.data) {
        setFxRate(fxResult.data.gbpusd_rate)
      }

      // Get the most recent balance for each account and normalize categories
      const accountsMap = new Map<string, AccountBalance>()
      accountsResult.data.forEach((account: AccountBalance) => {
        const key = `${account.institution}-${account.account_name}`
        const existing = accountsMap.get(key)
        if (!existing || new Date(account.date_updated) > new Date(existing.date_updated)) {
          // Normalize the category before storing
          const normalizedAccount = {
            ...account,
            category: normalizeCategory(account.category),
          }
          accountsMap.set(key, normalizedAccount)
        }
      })

      setAccounts(Array.from(accountsMap.values()))
      setLoading(false)
    }

    fetchData()
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Calculate summary metrics
  const totalNetWorth = accounts.reduce((sum, acc) => {
    const converted = convertAmount(acc.balance_total_local, acc.currency, fxRate)
    return sum + converted
  }, 0)

  const liquidAssets = accounts
    .filter((acc) => ['Cash', 'Brokerage'].includes(acc.category))
    .reduce((sum, acc) => {
      const converted = convertAmount(acc.balance_total_local, acc.currency, fxRate)
      return sum + converted
    }, 0)

  const illiquidAssets = accounts
    .filter((acc) => !['Cash', 'Brokerage'].includes(acc.category))
    .reduce((sum, acc) => {
      const converted = convertAmount(acc.balance_total_local, acc.currency, fxRate)
      return sum + converted
    }, 0)

  // Calculate category summary with Personal, Family, and Total
  const categorySummary = useMemo(() => {
    return CATEGORIES.map((category) => {
      const categoryAccounts = accounts.filter((acc) => acc.category === category)
      
      const personalTotal = categoryAccounts.reduce((sum, acc) => {
        const converted = convertAmount(acc.balance_personal_local, acc.currency, fxRate)
        return sum + converted
      }, 0)
      
      const familyTotal = categoryAccounts.reduce((sum, acc) => {
        const converted = convertAmount(acc.balance_family_local, acc.currency, fxRate)
        return sum + converted
      }, 0)
      
      const total = categoryAccounts.reduce((sum, acc) => {
        const converted = convertAmount(acc.balance_total_local, acc.currency, fxRate)
        return sum + converted
      }, 0)
      
      return {
        category,
        personal: personalTotal,
        family: familyTotal,
        total,
      }
    }).filter((item) => item.total !== 0)
  }, [accounts, fxRate, convertAmount])

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    return categorySummary.reduce(
      (acc, item) => ({
        personal: acc.personal + item.personal,
        family: acc.family + item.family,
        total: acc.total + item.total,
      }),
      { personal: 0, family: 0, total: 0 }
    )
  }, [categorySummary])

  // Calculate max balance for scaling bars in summary table
  const maxSummaryBalance = useMemo(() => {
    return Math.max(...categorySummary.map((item) => Math.abs(item.total)), grandTotals.total, 1)
  }, [categorySummary, grandTotals])

  // Group accounts by category and sort by balance (descending)
  const groupedByCategory = useMemo(() => {
    return CATEGORIES.map((category) => {
      const categoryAccounts = accounts.filter((acc) => acc.category === category)
      
      // Sort accounts by converted balance in descending order
      const sortedAccounts = [...categoryAccounts].sort((a, b) => {
        const balanceA = convertAmount(a.balance_total_local, a.currency, fxRate)
        const balanceB = convertAmount(b.balance_total_local, b.currency, fxRate)
        return balanceB - balanceA // Descending order
      })
      
      const subtotal = sortedAccounts.reduce((sum, acc) => {
        const converted = convertAmount(acc.balance_total_local, acc.currency, fxRate)
        return sum + converted
      }, 0)
      
      return {
        category,
        accounts: sortedAccounts,
        subtotal,
      }
    }).filter((group) => group.accounts.length > 0)
  }, [accounts, fxRate, convertAmount])

  // Calculate max balance for scaling bars in accounts table
  const maxAccountBalance = useMemo(() => {
    const allBalances = groupedByCategory.flatMap((group) =>
      group.accounts.map((acc) =>
        Math.abs(convertAmount(acc.balance_total_local, acc.currency, fxRate))
      )
    )
    const subtotals = groupedByCategory.map((group) => Math.abs(group.subtotal))
    return Math.max(...allBalances, ...subtotals, 1)
  }, [groupedByCategory, fxRate, convertAmount])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
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
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading accounts"
            description={error}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <KPICard title="Total Net Worth" value={totalNetWorth} />
        <KPICard title="Liquid Assets" value={liquidAssets} subtitle="Cash + Brokerage" />
        <KPICard title="Illiquid Assets" value={illiquidAssets} />
      </div>

      {/* Category Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Account Category Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              {/* Grand Totals Row */}
              <TableRow className="bg-muted/50">
                <TableHead className="font-bold text-black">Total</TableHead>
                <TableHead className="text-right font-bold text-black">
                  {formatCurrency(grandTotals.personal)}
                </TableHead>
                <TableHead className="text-right font-bold text-black">
                  {formatCurrency(grandTotals.family)}
                </TableHead>
                <TableHead className="text-right font-bold text-black">
                  {formatCurrency(grandTotals.total)}
                </TableHead>
                <TableHead>
                  <div className="relative h-4 w-20">
                    <div
                      className="absolute h-full bg-blue-900 right-0"
                      style={{
                        width: `${Math.min((Math.abs(grandTotals.total) / maxSummaryBalance) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
              {/* Column Headers */}
              <TableRow>
                <TableHead>Account Category</TableHead>
                <TableHead className="text-right">Personal</TableHead>
                <TableHead className="text-right">Family</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-24"></TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorySummary.map((item) => (
                <TableRow key={item.category}>
                  <TableCell className="font-medium">
                    {CATEGORY_DISPLAY_NAMES[item.category] || item.category}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.personal === 0 ? '-' : formatCurrency(item.personal)}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.family === 0 ? '-' : formatCurrency(item.family)}
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
                  <TableCell></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block relative max-h-[600px] overflow-auto border rounded-md">
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="sticky top-0 z-20 bg-background">Category</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">Institution</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">Account Name</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">Currency</TableHead>
                  <TableHead className="sticky top-0 z-20 text-right bg-background">Balance</TableHead>
                  <TableHead className="sticky top-0 z-20 w-24 bg-background"></TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background">Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByCategory.map((group) => (
                  <Fragment key={group.category}>
                    {group.accounts.map((account) => {
                      const convertedBalance = convertAmount(
                        account.balance_total_local,
                        account.currency,
                        fxRate
                      )
                      return (
                        <TableRow key={`${account.institution}-${account.account_name}`}>
                          <TableCell className="font-medium">{account.category}</TableCell>
                          <TableCell>{account.institution}</TableCell>
                          <TableCell>{account.account_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{account.currency}</Badge>
                          </TableCell>
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
                          <TableCell>{formatDate(account.date_updated)}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow key={`subtotal-${group.category}`} className="bg-muted/50">
                      <TableCell colSpan={4} className="font-semibold">
                        {group.category} Subtotal
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
                      <TableCell></TableCell>
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
}
