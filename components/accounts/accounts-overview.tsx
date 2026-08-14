'use client'

import { useState, Fragment, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { Input } from '@/components/ui/input'
import { KPICard } from '@/components/kpi-card'
import { TRUST_EXCLUSION_LABEL } from '@/lib/trust-exclusions'
import {
  assetsByCategoryGbp,
  illiquidAssetsGbp,
  latestAccountsByKey,
  liquidAssetsGbp,
  normalizeAccountCategory,
  presentCategories,
  totalAssetsGbp,
} from '@/lib/account-totals'
import { useCurrency } from '@/lib/contexts/currency-context'
import { AccountBalance } from '@/lib/types'
import { parseLocalDate, todayLocalDateString } from '@/lib/date-utils'
import { Button } from '@/components/ui/button'
import { AlertCircle, Building2, LineChart, Loader2, Pencil, Wallet } from 'lucide-react'
import { cn } from '@/utils/cn'
import { EditAccountDialog } from '@/components/accounts/edit-account-dialog'
import { FullTableViewWrapper } from '@/components/dashboard/full-table-view-wrapper'
import { FullTableViewToggle } from '@/components/dashboard/full-table-view-toggle'
import { toast } from 'sonner'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { queryKeys } from '@/lib/query-keys'

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'Cash': 'Cash',
  'Brokerage': 'Brokerage',
  'Alt Inv': 'Alternative Investment',
  'Retirement': 'Retirement',
  'Taconic': 'Taconic',
  'House': 'House',
  'Trust': 'Trust',
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return todayLocalDateString()
  return value.slice(0, 10)
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function isEditableSource(source: AccountBalance['data_source']) {
  return source === 'manual' || source === 'csv'
}

export function AccountsOverview() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const queryClient = useQueryClient()
  const { data: rawAccounts, isLoading: loading, error: queryError } = useAccounts()
  const error = queryError ? 'Failed to load account data. Please try refreshing the page.' : null
  const [fullTableOpen, setFullTableOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountBalance | null>(null)
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, { balance_total_local: string; date_updated: string }>>({})

  const accounts = useMemo(
    () =>
      latestAccountsByKey(rawAccounts ?? []).map((account) => ({
        ...account,
        category: normalizeAccountCategory(account.category),
      })),
    [rawAccounts]
  )

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

  const formatCurrencyByCode = (value: number, currencyCode: 'USD' | 'GBP' | 'EUR') => {
    const locale = currencyCode === 'GBP' ? 'en-GB' : 'en-US'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = parseLocalDate(dateString)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const beginBulkEdit = () => {
    const nextDrafts: Record<string, { balance_total_local: string; date_updated: string }> = {}
    accounts.forEach((account) => {
      if (!isEditableSource(account.data_source)) return
      nextDrafts[account.id] = {
        balance_total_local: String(account.balance_total_local ?? 0),
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

  const updateBulkDraft = (accountId: string, field: 'balance_total_local' | 'date_updated', value: string) => {
    setBulkDrafts((current) => ({
      ...current,
      [accountId]: {
        balance_total_local: current[accountId]?.balance_total_local ?? '',
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
      const currentBalance = Number(account.balance_total_local ?? 0)
      const draftBalance = Number(draft.balance_total_local)
      return draft.date_updated !== currentDate || draftBalance !== currentBalance
    })

    if (changedAccounts.length === 0) {
      toast.info('No account changes to save')
      setBulkEditMode(false)
      return
    }

    for (const account of changedAccounts) {
      const draft = bulkDrafts[account.id]
      const balanceValue = Number(draft.balance_total_local)
      if (!Number.isFinite(balanceValue)) {
        toast.error(`Invalid balance for ${account.account_name}`)
        return
      }
      if (!draft.date_updated) {
        toast.error(`Missing date for ${account.account_name}`)
        return
      }
    }

    setBulkSaving(true)
    try {
      const results = await Promise.all(
        changedAccounts.map(async (account) => {
          const draft = bulkDrafts[account.id]
          const newTotal = Number(draft.balance_total_local)
          const oldTotal = Number(account.balance_total_local ?? 0)
          const oldPersonal = Number(account.balance_personal_local ?? 0)
          const oldFamily = Number(account.balance_family_local ?? 0)

          let nextPersonal = newTotal
          let nextFamily = 0
          if (oldTotal !== 0) {
            const personalRatio = oldPersonal / oldTotal
            nextPersonal = round2(newTotal * personalRatio)
            nextFamily = round2(newTotal - nextPersonal)
          }

          const res = await fetch(`/api/accounts/${account.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              balance_total_local: round2(newTotal),
              balance_personal_local: nextPersonal,
              balance_family_local: nextFamily,
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
        toast.success(`Saved ${successCount} account ${successCount === 1 ? 'update' : 'updates'}`)
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} account ${failedCount === 1 ? 'update failed' : 'updates failed'}`)
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
      setBulkEditMode(false)
      setBulkDrafts({})
    } catch (error) {
      console.error('Bulk account save error:', error)
      toast.error('Failed to save account changes')
    } finally {
      setBulkSaving(false)
    }
  }

  // Check if there are any Trust accounts
  const hasTrustAccounts = useMemo(() => {
    return accounts.some((acc) => acc.category === 'Trust' && Math.abs(acc.balance_total_local) > 0)
  }, [accounts])

  // Every category actually present, not a hard-coded list. The old list dropped
  // any category nobody had thought of, so the summary table and its own grand
  // total could disagree while both looked complete.
  const visibleCategories = useMemo(() => presentCategories(accounts, 'all'), [accounts])

  // Check if dataset has multiple currencies
  const hasMultipleCurrencies = useMemo(() => {
    const currencies = new Set(accounts.map((acc) => acc.currency))
    return currencies.size > 1
  }, [accounts])

  // Check if dataset has any family data
  const hasPersonalAndFamily = useMemo(() => {
    return accounts.some((acc) => Math.abs(acc.balance_family_local) > 0)
  }, [accounts])

  // Every figure below comes out of lib/account-totals in GBP and is restated
  // into the display currency here. Totals are a fact about the balance sheet;
  // the currency toggle is a formatting choice, and mixing the two is how three
  // surfaces ended up with three answers for total assets.
  const toDisplay = useMemo(
    () => (gbpValue: number) => convertAmount(gbpValue, 'GBP', fxRate),
    [convertAmount, fxRate]
  )

  // These three cards carry TRUST_EXCLUSION_LABEL, so they take the spendable
  // basis. Liquid + illiquid sum to net worth by construction.
  const totalNetWorth = toDisplay(totalAssetsGbp(accounts, fxRate, 'spendable'))
  const liquidAssets = toDisplay(liquidAssetsGbp(accounts, fxRate, 'spendable'))
  const illiquidAssets = toDisplay(illiquidAssetsGbp(accounts, fxRate, 'spendable'))

  // Calculate merged category summary (Personal/Family + Currency breakdown).
  // Trust-inclusive, and labelled as such below.
  const categorySummary = useMemo(() => {
    const totalsByCategory = assetsByCategoryGbp(accounts, fxRate, 'all')

    return visibleCategories
      .map((category) => {
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

        const total = convertAmount(totalsByCategory.get(category) ?? 0, 'GBP', fxRate)

        return { category, personal, family, gbp, usd, total }
      })
      .filter((item) => item.total !== 0)
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
    const totalsByCategory = assetsByCategoryGbp(accounts, fxRate, 'all')

    return visibleCategories
      .map((category) => {
        const categoryAccounts = accounts.filter((acc) => acc.category === category)

        // Sort accounts by converted balance in descending order
        const sortedAccounts = [...categoryAccounts].sort((a, b) => {
          const balanceA = convertAmount(a.balance_total_local, a.currency, fxRate)
          const balanceB = convertAmount(b.balance_total_local, b.currency, fxRate)
          return balanceB - balanceA // Descending order
        })

        return {
          category,
          accounts: sortedAccounts,
          // Same source as the summary table's row, so the two cannot drift.
          subtotal: convertAmount(totalsByCategory.get(category) ?? 0, 'GBP', fxRate),
        }
      })
      .filter((group) => group.accounts.length > 0)
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
            <Card key={i} className="">
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

  const compactTable = '[&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-medium [&_td]:h-8 [&_td]:px-2 [&_td]:py-1 [&_td]:text-[13px] [&_td]:num'

  /** Rendered into both the mobile and desktop Accounts card headers. */
  const bulkEditControls = !bulkEditMode ? (
    <Button variant="outline" size="sm" onClick={beginBulkEdit}>
      Edit all
    </Button>
  ) : (
    <>
      <Button variant="outline" size="sm" onClick={cancelBulkEdit} disabled={bulkSaving}>
        Cancel
      </Button>
      <Button size="sm" onClick={saveBulkChanges} disabled={bulkSaving}>
        {bulkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save all
      </Button>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:pb-0 md:items-stretch">
        <div className="shrink-0 w-[85%] min-w-[85%] snap-center md:w-full md:min-w-0">
          <KPICard title="Total Net Worth" value={totalNetWorth} note={TRUST_EXCLUSION_LABEL} />
        </div>
        <div className="shrink-0 w-[85%] min-w-[85%] snap-center md:w-full md:min-w-0">
          <KPICard title="Liquid Assets" value={liquidAssets} subtitle="Cash + Brokerage" note={TRUST_EXCLUSION_LABEL} />
        </div>
        <div className="shrink-0 w-[85%] min-w-[85%] snap-center md:w-full md:min-w-0">
          <KPICard title="Illiquid Assets" value={illiquidAssets} note={TRUST_EXCLUSION_LABEL} />
        </div>
      </div>

      {/* Category Summary — Mobile card layout */}
      <Card className="md:hidden">
        <CardHeader className="px-4 py-3 pb-2">
          <CardTitle>Account Category Summary</CardTitle>
          {hasTrustAccounts && (
            <p className="text-meta text-muted-foreground">
              Totals include trust capital, unlike the figures above.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-4 pt-2 md:pt-2 space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Grand Total</div>
            {hasPersonalAndFamily && (
              <>
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">Personal</span>
                  <span className="font-medium num">{formatCurrency(grandTotals.personal)}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">Family</span>
                  <span className="font-medium num">{formatCurrency(grandTotals.family)}</span>
                </div>
              </>
            )}
            {hasMultipleCurrencies && (
              <>
                {hasPersonalAndFamily && <div className="border-t border-dashed my-1" />}
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">GBP</span>
                  <span className="font-medium num">{formatGBP(grandTotals.gbp)}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="text-sm">USD</span>
                  <span className="font-medium num">{formatUSD(grandTotals.usd)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-baseline gap-2 pt-2 border-t">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-semibold num">{formatCurrency(grandTotals.total)}</span>
            </div>
            <div className="relative h-2 w-full mt-2 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute h-full rounded-full transition-all duration-500 bg-primary left-0 top-0"
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
                    <span className="text-muted-foreground">Personal</span>
                    <span className="num">{item.personal === 0 ? '–' : formatCurrency(item.personal)}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="text-muted-foreground">Family</span>
                    <span className="num">{item.family === 0 ? '–' : formatCurrency(item.family)}</span>
                  </div>
                </>
              )}
              {hasMultipleCurrencies && (
                <>
                  {hasPersonalAndFamily && <div className="border-t border-dashed my-1" />}
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="text-muted-foreground">GBP</span>
                    <span className="num">{item.gbp === 0 ? '–' : formatGBP(item.gbp)}</span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                    <span className="text-muted-foreground">USD</span>
                    <span className="num">{item.usd === 0 ? '–' : formatUSD(item.usd)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-baseline gap-2 text-sm pt-2 border-t mt-1">
                <span className="font-medium">Balance</span>
                <span className="font-medium num">{formatCurrency(item.total)}</span>
              </div>
              <div className="relative h-1.5 w-full mt-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute h-full rounded-full transition-all duration-500 bg-primary left-0 top-0"
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
      <div className="hidden md:block">
        <Card>
          <CardHeader className="px-4 py-3 pb-4">
            <CardTitle>Account Category Summary</CardTitle>
            {hasTrustAccounts && (
              <p className="text-meta text-muted-foreground">
                Totals include trust capital, unlike the figures above.
              </p>
            )}
          </CardHeader>
          <CardContent className="p-4 pt-2 md:pt-2">
            <Table className={compactTable}>
              <TableHeader>
                <TableRow>
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
                <TableRow>
                  <TableHead>Account Category</TableHead>
                  {hasPersonalAndFamily && (
                    <>
                      <TableHead className="text-right text-muted-foreground">Personal</TableHead>
                      <TableHead className="text-right text-muted-foreground">Family</TableHead>
                    </>
                  )}
                  {hasMultipleCurrencies && (
                    <>
                      <TableHead className={cn("text-right", hasPersonalAndFamily && "border-l-2 border-border")}>GBP</TableHead>
                      <TableHead className="text-right">USD</TableHead>
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
                      <div className="relative h-3 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className="absolute h-full rounded-full transition-all duration-500 bg-primary left-0 top-0"
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
        <CardHeader className="px-4 py-3 pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Accounts</CardTitle>
          <div className="flex items-center gap-2">{bulkEditControls}</div>
        </CardHeader>
        <CardContent className="p-4 pt-2 md:pt-2 space-y-4">
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
                          {!bulkEditMode && isEditableSource(account.data_source) && (
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
                      {bulkEditMode && isEditableSource(account.data_source) ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
                          <div className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Balance ({account.currency})</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={bulkDrafts[account.id]?.balance_total_local ?? ''}
                              onChange={(e) => updateBulkDraft(account.id, 'balance_total_local', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">Last Updated</span>
                            <Input
                              type="date"
                              value={bulkDrafts[account.id]?.date_updated ?? toDateInputValue(account.date_updated)}
                              onChange={(e) => updateBulkDraft(account.id, 'date_updated', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                          <span className="text-xs text-muted-foreground block">
                            Updated {formatDate(account.date_updated)}
                          </span>
                          <span className="font-semibold num text-sm shrink-0">
                            {formatCurrency(convertedBalance)}
                          </span>
                        </div>
                      )}
                      <div className="relative h-1.5 w-full mt-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="absolute h-full rounded-full transition-all duration-500 bg-primary left-0 top-0"
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
                  <span className="font-semibold num text-sm">{formatCurrency(group.subtotal)}</span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Accounts Table — Desktop */}
      <Card className="hidden md:block">
        <CardHeader className="px-4 py-3 pb-4 flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Accounts</CardTitle>
          {/* Bulk edit and full-table both act on this table, so both live in
              its header. "Edit All" used to float right-aligned in the gap
              between two cards, belonging to neither. */}
          <div className="flex items-center gap-2">
            {bulkEditControls}
            <FullTableViewToggle
              fullView={fullTableOpen}
              onToggle={() => setFullTableOpen((v) => !v)}
              aria-label="Toggle full table view for Accounts"
            />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 md:pt-2">
          <FullTableViewWrapper
            fullView={fullTableOpen}
            onClose={() => setFullTableOpen(false)}
            fullViewContainerClassName="w-[96vw] max-w-[96vw]"
            className={`relative max-h-[70vh] overflow-auto rounded-md ${compactTable}`}
          >
            {fullTableOpen ? (
              <table className="w-full table-fixed caption-bottom border-collapse text-[11px] leading-4">
                <TableHeader>
                  <TableRow className="border-b bg-muted/80">
                    <TableHead className="w-[12%] font-semibold">Account Category</TableHead>
                    <TableHead className="w-[17%] font-semibold">Institution</TableHead>
                    <TableHead className="w-[19%] font-semibold">Account Name</TableHead>
                    <TableHead className="w-[6%] text-center font-semibold">CCY</TableHead>
                    <TableHead className="w-[10%] text-right font-semibold">Personal</TableHead>
                    <TableHead className="w-[10%] text-right font-semibold">Family</TableHead>
                    <TableHead className="w-[11%] text-right font-semibold">Total Local</TableHead>
                    <TableHead className="w-[10%] text-right font-semibold">Total {currency}</TableHead>
                    <TableHead className="w-[9%] text-right font-semibold">Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedByCategory.map((group) => {
                    const groupCurrencies = Array.from(new Set(group.accounts.map((account) => account.currency)))
                    const singleCurrency = groupCurrencies.length === 1 ? groupCurrencies[0] : null
                    const subtotalPersonalLocal = group.accounts.reduce((sum, account) => sum + account.balance_personal_local, 0)
                    const subtotalFamilyLocal = group.accounts.reduce((sum, account) => sum + account.balance_family_local, 0)
                    const subtotalTotalLocal = group.accounts.reduce((sum, account) => sum + account.balance_total_local, 0)

                    return (
                      <Fragment key={group.category}>
                        {group.accounts.map((account) => {
                          const convertedBalance = convertAmount(
                            account.balance_total_local,
                            account.currency,
                            fxRate
                          )

                          return (
                            <TableRow key={`${account.institution}-${account.account_name}`} className="border-b border-border/70">
                              <TableCell className="truncate font-medium">
                                {CATEGORY_DISPLAY_NAMES[account.category] || account.category}
                              </TableCell>
                              <TableCell className="truncate">{account.institution}</TableCell>
                              <TableCell className="truncate">{account.account_name}</TableCell>
                              <TableCell className="text-center">{account.currency}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrencyByCode(account.balance_personal_local, account.currency)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrencyByCode(account.balance_family_local, account.currency)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrencyByCode(account.balance_total_local, account.currency)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(convertedBalance)}</TableCell>
                              <TableCell className="text-right">{formatDate(account.date_updated)}</TableCell>
                            </TableRow>
                          )
                        })}
                        <TableRow className="border-y bg-muted/60">
                          <TableCell colSpan={4} className="font-semibold">
                            {(CATEGORY_DISPLAY_NAMES[group.category] || group.category)} Subtotal
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {singleCurrency ? formatCurrencyByCode(subtotalPersonalLocal, singleCurrency) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {singleCurrency ? formatCurrencyByCode(subtotalFamilyLocal, singleCurrency) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {singleCurrency ? formatCurrencyByCode(subtotalTotalLocal, singleCurrency) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold">{formatCurrency(group.subtotal)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </table>
            ) : (
              <table className="w-full caption-bottom text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 top-0 z-30 bg-sunken">Category</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-sunken">Institution</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-sunken">Account Name</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-sunken">Currency</TableHead>
                    <TableHead className="sticky top-0 z-20 text-right bg-sunken">Balance</TableHead>
                    <TableHead className="sticky top-0 z-20 w-16 bg-sunken"></TableHead>
                    <TableHead className="sticky top-0 z-20 bg-sunken">Last Updated</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-sunken w-10"></TableHead>
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
                            <TableCell className="sticky left-0 z-20 bg-background font-medium">
                              {account.category}
                            </TableCell>
                            <TableCell>{account.institution}</TableCell>
                            <TableCell>{account.account_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{account.currency}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {bulkEditMode && isEditableSource(account.data_source) ? (
                                <div className="flex justify-end">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={bulkDrafts[account.id]?.balance_total_local ?? ''}
                                    onChange={(e) => updateBulkDraft(account.id, 'balance_total_local', e.target.value)}
                                    className="h-8 w-32 text-right"
                                  />
                                </div>
                              ) : (
                                formatCurrency(convertedBalance)
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="relative h-3 w-16 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="absolute h-full rounded-full transition-all duration-500 bg-primary left-0 top-0"
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
                                formatDate(account.date_updated)
                              )}
                            </TableCell>
                            <TableCell>
                              {!bulkEditMode && isEditableSource(account.data_source) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-11 w-11 min-h-[44px] min-w-[44px] p-0"
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
                        <TableCell colSpan={4} className="sticky left-0 z-20 bg-sunken/50 font-semibold">
                          {group.category} Subtotal
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(group.subtotal)}
                        </TableCell>
                        <TableCell>
                          <div className="relative h-3 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className="absolute h-full rounded-full transition-all duration-500 bg-primary left-0 top-0"
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
            )}
          </FullTableViewWrapper>
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
