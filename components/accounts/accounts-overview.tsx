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
import { AccountBalance } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AlertCircle, Maximize2, Pencil } from 'lucide-react'
import { cn } from '@/utils/cn'
import { EditAccountDialog } from '@/components/accounts/edit-account-dialog'

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
  const { currency, convertAmount, fxRate } = useCurrency()
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullTableOpen, setFullTableOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountBalance | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      const accountsResult = await supabase
        .from('account_balances')
        .select('*')
        .order('category')
        .order('institution')

      if (accountsResult.error) {
        console.error('Error fetching accounts:', accountsResult.error)
        setError('Failed to load account data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      
      setError(null)

      // Get the most recent balance for each account and normalize categories
      const accountsMap = new Map<string, AccountBalance>()
      ;(accountsResult.data ?? []).forEach((account: AccountBalance) => {
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

  const formatGBP = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Check if there are any Trust accounts
  const hasTrustAccounts = useMemo(() => {
    return accounts.some((acc) => acc.category === 'Trust' && Math.abs(acc.balance_total_local) > 0)
  }, [accounts])

  // Filter categories to exclude Trust if no Trust accounts exist
  const visibleCategories = useMemo(() => {
    return hasTrustAccounts ? CATEGORIES : CATEGORIES.filter((cat) => cat !== 'Trust')
  }, [hasTrustAccounts])

  // Check if dataset has multiple currencies
  const hasMultipleCurrencies = useMemo(() => {
    const currencies = new Set(accounts.map((acc) => acc.currency))
    return currencies.size > 1
  }, [accounts])

  // Check if dataset has any family data
  const hasPersonalAndFamily = useMemo(() => {
    return accounts.some((acc) => Math.abs(acc.balance_family_local) > 0)
  }, [accounts])

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

  // Calculate merged category summary (Personal/Family + Currency breakdown)
  const categorySummary = useMemo(() => {
    return visibleCategories.map((category) => {
      const categoryAccounts = accounts.filter((acc) => acc.category === category)

      const personal = categoryAccounts.reduce((sum, acc) => {
        return sum + convertAmount(acc.balance_personal_local, acc.currency, fxRate)
      }, 0)

      const family = categoryAccounts.reduce((sum, acc) => {
        return sum + convertAmount(acc.balance_family_local, acc.currency, fxRate)
      }, 0)

      const gbp = categoryAccounts
        .filter((acc) => acc.currency === 'GBP')
        .reduce((sum, acc) => sum + acc.balance_total_local, 0)

      const usd = categoryAccounts
        .filter((acc) => acc.currency === 'USD')
        .reduce((sum, acc) => sum + acc.balance_total_local, 0)

      const total = categoryAccounts.reduce((sum, acc) => {
        return sum + convertAmount(acc.balance_total_local, acc.currency, fxRate)
      }, 0)

      return { category, personal, family, gbp, usd, total }
    }).filter((item) => item.total !== 0)
  }, [accounts, fxRate, convertAmount, visibleCategories])

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    return categorySummary.reduce(
      (acc, item) => ({
        personal: acc.personal + item.personal,
        family: acc.family + item.family,
        gbp: acc.gbp + item.gbp,
        usd: acc.usd + item.usd,
        total: acc.total + item.total,
      }),
      { personal: 0, family: 0, gbp: 0, usd: 0, total: 0 }
    )
  }, [categorySummary])

  // Calculate max balance for scaling bars in summary table
  const maxSummaryBalance = useMemo(() => {
    return Math.max(...categorySummary.map((item) => Math.abs(item.total)), 1)
  }, [categorySummary])

  // Group accounts by category and sort by balance (descending)
  const groupedByCategory = useMemo(() => {
    return visibleCategories.map((category) => {
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
  }, [accounts, fxRate, convertAmount, visibleCategories])

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

  const compactTable = '[&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-medium [&_td]:h-8 [&_td]:px-2 [&_td]:py-1 [&_td]:text-[13px] [&_td]:tabular-nums'

  return (
    <div className="space-y-4">
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:pb-0 md:items-stretch">
        <div className="shrink-0 w-[85%] min-w-[85%] snap-center md:w-full md:min-w-0">
          <KPICard title="Total Net Worth" value={totalNetWorth} />
        </div>
        <div className="shrink-0 w-[85%] min-w-[85%] snap-center md:w-full md:min-w-0">
          <KPICard title="Liquid Assets" value={liquidAssets} subtitle="Cash + Brokerage" />
        </div>
        <div className="shrink-0 w-[85%] min-w-[85%] snap-center md:w-full md:min-w-0">
          <KPICard title="Illiquid Assets" value={illiquidAssets} />
        </div>
      </div>

      {/* Category Summary — Mobile card layout */}
      <Card className="md:hidden">
        <CardHeader className="bg-muted/50 px-4 py-3 pb-2">
          <CardTitle className="text-base">Account Category Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Grand Total</div>
            {hasPersonalAndFamily && (
              <>
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">Personal</span>
                  <span className="font-medium tabular-nums">{formatCurrency(grandTotals.personal)}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">Family</span>
                  <span className="font-medium tabular-nums">{formatCurrency(grandTotals.family)}</span>
                </div>
              </>
            )}
            {hasMultipleCurrencies && (
              <>
                {hasPersonalAndFamily && <div className="border-t border-dashed my-1" />}
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">GBP</span>
                  <span className="font-medium tabular-nums">{formatGBP(grandTotals.gbp)}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">USD</span>
                  <span className="font-medium tabular-nums">{formatUSD(grandTotals.usd)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-baseline gap-2 pt-2 border-t">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-semibold tabular-nums">{formatCurrency(grandTotals.total)}</span>
            </div>
            <div className="relative h-2 w-full mt-2 rounded bg-muted overflow-hidden">
              <div
                className="absolute h-full bg-blue-900 left-0 top-0 rounded"
                style={{
                  width: `${Math.min((Math.abs(grandTotals.total) / maxSummaryBalance) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
          {categorySummary.map((item) => (
            <div key={item.category} className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">
                {CATEGORY_DISPLAY_NAMES[item.category] || item.category}
              </div>
              {hasPersonalAndFamily && (
                <>
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="text-blue-700">Personal</span>
                    <span className="tabular-nums">{item.personal === 0 ? '–' : formatCurrency(item.personal)}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="text-blue-700">Family</span>
                    <span className="tabular-nums">{item.family === 0 ? '–' : formatCurrency(item.family)}</span>
                  </div>
                </>
              )}
              {hasMultipleCurrencies && (
                <>
                  {hasPersonalAndFamily && <div className="border-t border-dashed my-1" />}
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="text-emerald-700">GBP</span>
                    <span className="tabular-nums">{item.gbp === 0 ? '–' : formatGBP(item.gbp)}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="text-emerald-700">USD</span>
                    <span className="tabular-nums">{item.usd === 0 ? '–' : formatUSD(item.usd)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-baseline gap-2 text-sm pt-2 border-t mt-1">
                <span className="font-medium">Balance</span>
                <span className="font-medium tabular-nums">{formatCurrency(item.total)}</span>
              </div>
              <div className="relative h-1.5 w-full mt-2 rounded bg-muted overflow-hidden">
                <div
                  className="absolute h-full bg-blue-900 left-0 top-0 rounded"
                  style={{
                    width: `${Math.min((Math.abs(item.total) / maxSummaryBalance) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Category Summary Table — Desktop */}
      <div className="hidden md:block w-fit">
        <Card>
          <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
            <CardTitle className="text-base">Account Category Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Table className={compactTable}>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="font-bold text-foreground">Total</TableHead>
                  {hasPersonalAndFamily && (
                    <>
                      <TableHead className="text-right font-bold text-foreground">
                        {formatCurrency(grandTotals.personal)}
                      </TableHead>
                      <TableHead className="text-right font-bold text-foreground">
                        {formatCurrency(grandTotals.family)}
                      </TableHead>
                    </>
                  )}
                  {hasMultipleCurrencies && (
                    <>
                      <TableHead className={cn("text-right font-bold text-foreground", hasPersonalAndFamily && "border-l-2 border-border")}>
                        {formatGBP(grandTotals.gbp)}
                      </TableHead>
                      <TableHead className="text-right font-bold text-foreground">
                        {formatUSD(grandTotals.usd)}
                      </TableHead>
                    </>
                  )}
                  <TableHead className="text-right !font-extrabold !text-sm text-foreground">
                    {formatCurrency(grandTotals.total)}
                  </TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
                <TableRow className="bg-muted">
                  <TableHead>Account Category</TableHead>
                  {hasPersonalAndFamily && (
                    <>
                      <TableHead className="text-right text-blue-700">Personal</TableHead>
                      <TableHead className="text-right text-blue-700">Family</TableHead>
                    </>
                  )}
                  {hasMultipleCurrencies && (
                    <>
                      <TableHead className={cn("text-right text-emerald-700", hasPersonalAndFamily && "border-l-2 border-border")}>GBP</TableHead>
                      <TableHead className="text-right text-emerald-700">USD</TableHead>
                    </>
                  )}
                  <TableHead className="text-right font-bold">Balance</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorySummary.map((item) => (
                  <TableRow key={item.category}>
                    <TableCell className="font-medium">
                      {CATEGORY_DISPLAY_NAMES[item.category] || item.category}
                    </TableCell>
                    {hasPersonalAndFamily && (
                      <>
                        <TableCell className="text-right">
                          {item.personal === 0 ? '-' : formatCurrency(item.personal)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.family === 0 ? '-' : formatCurrency(item.family)}
                        </TableCell>
                      </>
                    )}
                    {hasMultipleCurrencies && (
                      <>
                        <TableCell className={cn("text-right", hasPersonalAndFamily && "border-l-2 border-border")}>
                          {item.gbp === 0 ? '-' : formatGBP(item.gbp)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.usd === 0 ? '-' : formatUSD(item.usd)}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(item.total)}
                    </TableCell>
                    <TableCell>
                      <div className="relative h-3 w-16">
                        <div
                          className="absolute h-full bg-blue-900 right-0"
                          style={{
                            width: `${Math.min((Math.abs(item.total) / maxSummaryBalance) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Accounts — Mobile card layout */}
      <Card className="md:hidden">
        <CardHeader className="bg-muted/50 px-4 py-3 pb-2">
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          {groupedByCategory.map((group) => (
            <div key={group.category}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-0.5">
                {CATEGORY_DISPLAY_NAMES[group.category] || group.category}
              </div>
              <div className="space-y-2">
                {group.accounts.map((account) => {
                  const convertedBalance = convertAmount(
                    account.balance_total_local,
                    account.currency,
                    fxRate
                  )
                  return (
                    <div
                      key={`${account.institution}-${account.account_name}`}
                      className="rounded-lg border p-3 min-h-[44px]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{account.account_name}</div>
                          <div className="text-xs text-muted-foreground truncate">{account.institution}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {account.data_source === 'manual' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => setEditingAccount(account)}
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                          <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                            {account.currency}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t">
                        <span className="text-xs text-muted-foreground block">
                          Updated {formatDate(account.date_updated)}
                        </span>
                        <span className="font-semibold tabular-nums text-sm shrink-0">
                          {formatCurrency(convertedBalance)}
                        </span>
                      </div>
                      <div className="relative h-1.5 w-full mt-1.5 rounded bg-muted overflow-hidden">
                        <div
                          className="absolute h-full bg-blue-900 left-0 top-0 rounded"
                          style={{
                            width: `${Math.min((Math.abs(convertedBalance) / maxAccountBalance) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
                <div className="rounded-lg border border-dashed bg-muted/30 p-3 flex justify-between items-center">
                  <span className="text-sm font-semibold">{group.category} Subtotal</span>
                  <span className="font-semibold tabular-nums text-sm">{formatCurrency(group.subtotal)}</span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Accounts Table — Desktop */}
      <Card className="hidden md:block">
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Accounts</CardTitle>
          <Dialog open={fullTableOpen} onOpenChange={setFullTableOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Maximize2 className="h-4 w-4 mr-2" />
                View Full Table
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>All Accounts</DialogTitle>
              </DialogHeader>
              <div className="mt-4 [&_table]:text-[11px] [&_th]:h-7 [&_td]:h-7 [&_th]:py-0.5 [&_td]:py-0.5 [&_th]:px-2 [&_td]:px-2 [&_th]:text-[11px] [&_td]:tabular-nums">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-bold">Category</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right font-bold">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/70 font-semibold">
                      <TableCell>Grand Total</TableCell>
                      <TableCell colSpan={3}></TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(totalNetWorth)}
                      </TableCell>
                    </TableRow>
                    {groupedByCategory.map((group) => (
                      <Fragment key={`dialog-${group.category}`}>
                        {group.accounts.map((account) => {
                          const convertedBalance = convertAmount(
                            account.balance_total_local,
                            account.currency,
                            fxRate
                          )
                          return (
                            <TableRow key={`dialog-${account.institution}-${account.account_name}`}>
                              <TableCell className="font-medium">{account.category}</TableCell>
                              <TableCell>{account.institution}</TableCell>
                              <TableCell>{account.account_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {account.currency}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatCurrency(convertedBalance)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        <TableRow className="bg-muted/50">
                          <TableCell colSpan={4} className="font-semibold">
                            {group.category} Subtotal
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(group.subtotal)}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className={`relative max-h-[70vh] overflow-auto border rounded-md ${compactTable}`}>
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow className="border-b bg-muted">
                  <TableHead className="sticky top-0 z-20 bg-muted">Category</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-muted">Institution</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-muted">Account Name</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-muted">Currency</TableHead>
                  <TableHead className="sticky top-0 z-20 text-right bg-muted">Balance</TableHead>
                  <TableHead className="sticky top-0 z-20 w-16 bg-muted"></TableHead>
                  <TableHead className="sticky top-0 z-20 bg-muted">Last Updated</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-muted w-10"></TableHead>
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
                            <div className="relative h-3 w-16">
                              <div
                                className="absolute h-full bg-blue-900 right-0"
                                style={{
                                  width: `${Math.min((Math.abs(convertedBalance) / maxAccountBalance) * 100, 100)}%`,
                                }}
                              />
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(account.date_updated)}</TableCell>
                          <TableCell>
                            {account.data_source === 'manual' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditingAccount(account)}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </TableCell>
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
                        <div className="relative h-3 w-16">
                          <div
                            className="absolute h-full bg-blue-900 right-0"
                            style={{
                              width: `${Math.min((Math.abs(group.subtotal) / maxAccountBalance) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Account Dialog */}
      {editingAccount && (
        <EditAccountDialog
          account={editingAccount}
          open={!!editingAccount}
          onOpenChange={(open) => { if (!open) setEditingAccount(null) }}
        />
      )}
    </div>
  )
}
