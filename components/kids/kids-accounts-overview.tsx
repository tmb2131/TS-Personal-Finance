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
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { KidsAccount } from '@/lib/types'
import { useCurrency } from '@/lib/contexts/currency-context'
import { AlertCircle, Loader2, Pencil, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'
import { EditKidsAccountDialog } from '@/components/kids/edit-kids-account-dialog'
import { toast } from 'sonner'

interface ChildSummary {
  childName: string
  totalNetWorth: number
  accountCount: number
  accountTypeCount: number
}

function getSourceLabel(source: KidsAccount['data_source']) {
  if (source === 'csv') return 'CSV'
  if (source === 'plaid') return 'Plaid'
  if (source === 'google_sheet') return 'Sheet'
  return 'Manual'
}

function getSourceClass(source: KidsAccount['data_source']) {
  if (source === 'csv') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
  if (source === 'plaid') return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800'
  if (source === 'google_sheet') return 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700'
  return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function isEditableSource(source: KidsAccount['data_source']) {
  return source === 'manual' || source === 'csv'
}

export function KidsAccountsOverview() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const [accounts, setAccounts] = useState<KidsAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingAccount, setEditingAccount] = useState<KidsAccount | null>(null)
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, { balance_usd: string; date_updated: string }>>({})

  const loadKidsAccounts = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    loadKidsAccounts()
  }, [loadKidsAccounts])

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

  const beginBulkEdit = () => {
    const nextDrafts: Record<string, { balance_usd: string; date_updated: string }> = {}
    accounts.forEach((account) => {
      if (!isEditableSource(account.data_source)) return
      nextDrafts[account.id] = {
        balance_usd: String(account.balance_usd ?? 0),
        date_updated: toDateInputValue(account.date_updated),
      }
    })
    setBulkDrafts(nextDrafts)
    setBulkEditMode(true)
  }

  const cancelBulkEdit = () => {
    setBulkEditMode(false)
    setBulkDrafts({})
  }

  const updateBulkDraft = (accountId: string, field: 'balance_usd' | 'date_updated', value: string) => {
    setBulkDrafts((current) => ({
      ...current,
      [accountId]: {
        balance_usd: current[accountId]?.balance_usd ?? '',
        date_updated: current[accountId]?.date_updated ?? toDateInputValue(null),
        [field]: value,
      },
    }))
  }

  const saveBulkChanges = async () => {
    const changedAccounts = accounts.filter((account) => {
      if (!isEditableSource(account.data_source)) return false
      const draft = bulkDrafts[account.id]
      if (!draft) return false
      const currentDate = toDateInputValue(account.date_updated)
      const currentBalance = Number(account.balance_usd ?? 0)
      const draftBalance = Number(draft.balance_usd)
      return currentDate !== draft.date_updated || currentBalance !== draftBalance
    })

    if (changedAccounts.length === 0) {
      toast.info('No kids account changes to save')
      setBulkEditMode(false)
      return
    }

    for (const account of changedAccounts) {
      const draft = bulkDrafts[account.id]
      if (!Number.isFinite(Number(draft.balance_usd))) {
        toast.error(`Invalid balance for ${account.child_name} - ${account.account_type}`)
        return
      }
      if (!draft.date_updated) {
        toast.error(`Missing date for ${account.child_name} - ${account.account_type}`)
        return
      }
    }

    setBulkSaving(true)
    try {
      const results = await Promise.all(
        changedAccounts.map(async (account) => {
          const draft = bulkDrafts[account.id]
          const res = await fetch(`/api/kids/${account.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              balance_usd: Number(draft.balance_usd),
              date_updated: draft.date_updated,
            }),
          })

          const payload = await res.json().catch(() => ({}))
          return res.ok && payload?.success === true
        })
      )

      const successCount = results.filter(Boolean).length
      const failedCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`Saved ${successCount} kids account ${successCount === 1 ? 'update' : 'updates'}`)
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} kids account ${failedCount === 1 ? 'update failed' : 'updates failed'}`)
      }

      await loadKidsAccounts()
      setBulkEditMode(false)
      setBulkDrafts({})
    } catch (error) {
      console.error('Bulk kids account save error:', error)
      toast.error('Failed to save kids account changes')
    } finally {
      setBulkSaving(false)
    }
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
            <Card key={i} className="border-l-[3px] border-l-indigo-500">
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
      <Card className="border-l-[3px] border-l-indigo-500">
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
      <Card className="border-l-[3px] border-l-indigo-500">
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <CardTitle className="text-base">Kids Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="No kids accounts found"
            description="No kids account data available yet."
          />
        </CardContent>
      </Card>
    )
  }

  const bulkEditActions = !bulkEditMode ? (
    <Button variant="outline" size="sm" onClick={beginBulkEdit}>
      Edit All
    </Button>
  ) : (
    <>
      <Button variant="outline" size="sm" onClick={cancelBulkEdit} disabled={bulkSaving}>
        Cancel
      </Button>
      <Button size="sm" onClick={saveBulkChanges} disabled={bulkSaving}>
        {bulkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save All
      </Button>
    </>
  )

  return (
    <div className="space-y-6">
      {/* Executive Summary Cards - One per child */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {childSummaries.map((summary) => (
          <Card key={summary.childName} className="border-l-[3px] border-l-indigo-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15">
                  <User className="h-5 w-5 text-indigo-600" />
                </div>
                <CardTitle className="text-lg">{summary.childName}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Total Net Worth</p>
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.totalNetWorth)}</p>
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

            {/* Account Type Summary — Mobile cards */}
            <Card className="md:hidden border-l-[3px] border-l-indigo-500">
              <CardHeader className="bg-muted/50 px-4 py-3 pb-2">
                <CardTitle className="text-base">Account Type Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-3 min-h-[44px]">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Total</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
                {accountTypeSummary.map((item) => (
                  <div key={item.accountType} className="rounded-lg border p-3 min-h-[44px]">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-medium text-sm truncate">{item.accountType}</span>
                      <span className="font-semibold tabular-nums text-sm shrink-0">{formatCurrency(item.total)}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                      Updated {formatDate(item.accounts.length > 0 ? item.accounts[0].date_updated : null)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Account Type Summary Table — Desktop */}
            <Card className="hidden md:block border-l-[3px] border-l-indigo-500">
              <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
                <CardTitle className="text-base">Account Type Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    {/* Grand Totals Row */}
                    <TableRow className="bg-muted">
                      <TableHead className="font-bold text-foreground">Total</TableHead>
                      <TableHead className="text-right font-bold text-foreground">
                        {formatCurrency(grandTotal)}
                      </TableHead>
                      <TableHead>
                        <div className="relative h-4 w-20 rounded-full bg-muted overflow-hidden">
                          <div
                            className="absolute h-full rounded-full transition-all duration-500 bg-blue-900 left-0 top-0"
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
                          <div className="relative h-4 w-20 rounded-full bg-muted overflow-hidden">
                            <div
                              className="absolute h-full rounded-full transition-all duration-500 bg-blue-900 left-0 top-0"
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

            {/* Account Details — Mobile cards */}
            <Card className="md:hidden border-l-[3px] border-l-indigo-500">
              <CardHeader className="bg-muted/50 px-4 py-3 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Account Details</CardTitle>
                  <div className="flex items-center gap-2">{bulkEditActions}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {groupedByAccountType.map((group) => (
                  <div key={String(group.accountType)}>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-0.5">
                      {group.accountType}
                    </div>
                    <div className="space-y-2">
                      {group.accounts.map((account) => {
                        const convertedBalance = convertAmount(Number(account.balance_usd) || 0, 'USD', fxRate)
                        return (
                          <div
                            key={account.id ?? `${account.account_type}-${account.date_updated}-${account.notes ?? ''}`}
                            className="rounded-lg border p-3 min-h-[44px]"
                          >
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-medium text-sm truncate">{account.account_type ?? '–'}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                {bulkEditMode && isEditableSource(account.data_source) ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={bulkDrafts[account.id]?.balance_usd ?? ''}
                                    onChange={(e) => updateBulkDraft(account.id, 'balance_usd', e.target.value)}
                                    className="h-8 w-28 text-right text-sm"
                                  />
                                ) : (
                                  <span className="font-semibold tabular-nums text-sm">{formatCurrency(convertedBalance)}</span>
                                )}
                                <Badge variant="outline" className={cn('text-[11px] px-1.5 py-0', getSourceClass(account.data_source))}>
                                  {getSourceLabel(account.data_source)}
                                </Badge>
                                {!bulkEditMode && isEditableSource(account.data_source) && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingAccount(account)}>
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {bulkEditMode && isEditableSource(account.data_source) ? (
                              <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground">Last Updated</span>
                                  <Input
                                    type="date"
                                    value={bulkDrafts[account.id]?.date_updated ?? toDateInputValue(account.date_updated)}
                                    onChange={(e) => updateBulkDraft(account.id, 'date_updated', e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1 text-xs text-muted-foreground">
                                  {(account.purpose ?? account.notes) && (
                                    <div className="pt-2 truncate">{[account.purpose, account.notes].filter(Boolean).join(' · ')}</div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-0.5">
                                <div>Updated {formatDate(account.date_updated ?? null)}</div>
                                {(account.purpose ?? account.notes) && (
                                  <div className="truncate">{[account.purpose, account.notes].filter(Boolean).join(' · ')}</div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <div className="rounded-lg border border-dashed bg-muted/30 p-3 flex justify-between items-center min-h-[44px]">
                        <span className="text-sm font-semibold">{group.accountType} Subtotal</span>
                        <span className="font-semibold tabular-nums text-sm">{formatCurrency(group.subtotal)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Detailed Accounts Table — Desktop */}
            <Card className="hidden md:block border-l-[3px] border-l-indigo-500">
              <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Account Details</CardTitle>
                  <div className="flex items-center gap-2">{bulkEditActions}</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative max-h-[600px] overflow-auto border rounded-md">
                  <table className="w-full caption-bottom text-sm">
                    <TableHeader>
                      <TableRow className="border-b bg-muted">
                        <TableHead className="sticky top-0 z-20 bg-muted">Account Type</TableHead>
                        <TableHead className="sticky top-0 z-20 bg-muted">Source</TableHead>
                        <TableHead className="sticky top-0 z-20 text-right bg-muted">Balance ({currency})</TableHead>
                        <TableHead className="sticky top-0 z-20 w-24 bg-muted"></TableHead>
                        <TableHead className="sticky top-0 z-20 bg-muted">As of Date</TableHead>
                        <TableHead className="sticky top-0 z-20 bg-muted">Purpose</TableHead>
                        <TableHead className="sticky top-0 z-20 bg-muted">Notes</TableHead>
                        <TableHead className="sticky top-0 z-20 w-10 bg-muted"></TableHead>
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
                                <TableCell>
                                  <Badge variant="outline" className={cn('text-[11px]', getSourceClass(account.data_source))}>
                                    {getSourceLabel(account.data_source)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {bulkEditMode && isEditableSource(account.data_source) ? (
                                    <div className="flex justify-end">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={bulkDrafts[account.id]?.balance_usd ?? ''}
                                        onChange={(e) => updateBulkDraft(account.id, 'balance_usd', e.target.value)}
                                        className="h-8 w-32 text-right"
                                      />
                                    </div>
                                  ) : (
                                    formatCurrency(convertedBalance)
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="relative h-4 w-20 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="absolute h-full rounded-full transition-all duration-500 bg-blue-900 left-0 top-0"
                                      style={{
                                        width: `${Math.min((Math.abs(convertedBalance) / maxAccountBalance) * 100, 100)}%`,
                                      }}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {bulkEditMode && isEditableSource(account.data_source) ? (
                                    <Input
                                      type="date"
                                      value={bulkDrafts[account.id]?.date_updated ?? toDateInputValue(account.date_updated)}
                                      onChange={(e) => updateBulkDraft(account.id, 'date_updated', e.target.value)}
                                      className="h-8"
                                    />
                                  ) : (
                                    formatDate(account.date_updated ?? null)
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {account.purpose ?? '-'}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {account.notes ?? '-'}
                                </TableCell>
                                <TableCell>
                                  {!bulkEditMode && isEditableSource(account.data_source) && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingAccount(account)}>
                                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                          <TableRow key={`subtotal-${String(group.accountType)}`} className="bg-muted/50">
                            <TableCell colSpan={2} className="font-semibold">
                              {group.accountType} Subtotal
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(group.subtotal)}
                            </TableCell>
                            <TableCell>
                              <div className="relative h-4 w-20 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="absolute h-full rounded-full transition-all duration-500 bg-blue-900 left-0 top-0"
                                  style={{
                                    width: `${Math.min((Math.abs(group.subtotal) / maxAccountBalance) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            </TableCell>
                            <TableCell colSpan={4}></TableCell>
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

      {/* Edit dialog for app-managed accounts */}
      {editingAccount && (
        <EditKidsAccountDialog
          account={editingAccount}
          open={!!editingAccount}
          onOpenChange={(open) => { if (!open) setEditingAccount(null) }}
        />
      )}
    </div>
  )
}
