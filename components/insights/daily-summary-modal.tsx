'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrency } from '@/lib/contexts/currency-context'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BudgetTarget, MonthlyTrend } from '@/lib/types'
import { TrendingUp, TrendingDown, DollarSign, Target, Calendar, AlertCircle, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']
const STORAGE_KEY = 'findash_daily_summary_dismissed'

interface ForecastBridgeResponse {
  startDate: string
  endDate: string
  expensesBudgetStart: number
  expensesForecastStart: number
  expensesBudgetEnd: number
  expensesForecastEnd: number
  totalStart: number
  totalEnd: number
  drivers: Array<{
    category: string
    startForecast: number
    endForecast: number
    delta: number
  }>
}

interface DailySummaryModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DailySummaryModal({ open: controlledOpen, onOpenChange: controlledOnOpenChange }: DailySummaryModalProps = {}) {
  const { currency, fxRate, convertAmount } = useCurrency()
  // Support both controlled (from context) and uncontrolled (direct prop) usage
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const onOpenChange = isControlled ? controlledOnOpenChange! : setInternalOpen
  const [loading, setLoading] = useState(true)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  
  // Data state
  const [budgetData, setBudgetData] = useState<BudgetTarget[]>([])
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([])
  const [forecastBridge, setForecastBridge] = useState<ForecastBridgeResponse | null>(null)
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      
      // Get yesterday's date
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]
      const todayStr = new Date().toISOString().split('T')[0]

      try {
        const [budgetResult, monthlyResult, syncResult, bridgeResponse] = await Promise.all([
          supabase.from('budget_targets').select('*'),
          supabase.from('monthly_trends').select('*'),
          supabase.from('sync_metadata').select('last_sync_at').single(),
          fetch(`/api/forecast-bridge?startDate=${yesterdayStr}&endDate=${todayStr}`)
            .then(async (r) => {
              if (!r.ok) {
                const errorData = await r.json().catch(() => ({}))
                // If no data for yesterday, that's okay - we'll just not show that section
                if (r.status === 400 || r.status === 404) return null
                throw new Error(errorData.error || 'Failed to fetch forecast bridge')
              }
              return r.json()
            })
            .catch(() => null),
        ])

        if (budgetResult.data) setBudgetData(budgetResult.data as BudgetTarget[])
        if (monthlyResult.data) setMonthlyTrends(monthlyResult.data as MonthlyTrend[])
        if (syncResult.data?.last_sync_at) setLastSyncDate(syncResult.data.last_sync_at)
        if (bridgeResponse && !bridgeResponse.error) {
          setForecastBridge(bridgeResponse as ForecastBridgeResponse)
        }
      } catch (error) {
        console.error('Error fetching daily summary data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [open])

  // Calculate annual estimated spend (sum of tracking_est for expense categories)
  const annualEstimatedSpend = useMemo(() => {
    const expenses = budgetData.filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
    const totalGBP = expenses.reduce((sum, b) => sum + Math.abs(b.tracking_est_gbp ?? 0), 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [budgetData, currency, fxRate, convertAmount])

  // Calculate gap to budget
  const gapToBudget = useMemo(() => {
    const expenses = budgetData.filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
    const budgetTotalGBP = expenses.reduce((sum, b) => sum + Math.abs(b.annual_budget_gbp ?? 0), 0)
    const forecastTotalGBP = expenses.reduce((sum, b) => sum + Math.abs(b.tracking_est_gbp ?? 0), 0)
    const gapGBP = budgetTotalGBP - forecastTotalGBP // Positive = under budget, negative = over budget
    return currency === 'USD' ? convertAmount(gapGBP, 'GBP', fxRate) : gapGBP
  }, [budgetData, currency, fxRate, convertAmount])

  // Change since yesterday (from forecast bridge)
  const yesterdayChange = useMemo(() => {
    if (!forecastBridge) return null
    const changeGBP = forecastBridge.totalEnd - forecastBridge.totalStart
    return currency === 'USD' ? convertAmount(changeGBP, 'GBP', fxRate) : changeGBP
  }, [forecastBridge, currency, fxRate, convertAmount])

  // Top drivers of yesterday's change
  const topDrivers = useMemo(() => {
    if (!forecastBridge) return []
    const allDrivers = forecastBridge.drivers
      .filter((d) => d.category !== 'Other' && Math.abs(d.delta) > 0)
      .map((d) => ({
        category: d.category,
        deltaGBP: d.delta,
        delta: currency === 'USD' ? convertAmount(d.delta, 'GBP', fxRate) : d.delta,
      }))
    
    // Split into under budget drivers (negative delta) and over budget drivers (positive delta)
    const underBudgetDrivers = allDrivers
      .filter((d) => d.delta < 0)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
      .reverse()
      .slice(0, 3)
    
    const overBudgetDrivers = allDrivers
      .filter((d) => d.delta > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
    
    return { underBudgetDrivers, overBudgetDrivers }
  }, [forecastBridge, currency, fxRate, convertAmount])

  // Current monthly spend
  const currentMonthlySpend = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const totalGBP = expenses.reduce((sum, m) => sum + Math.abs(m.cur_month_est ?? 0), 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [monthlyTrends, currency, fxRate, convertAmount])

  // 3-month average monthly spend
  const threeMonthAvg = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const totalGBP = expenses.reduce((sum, m) => sum + Math.abs(m.ttm_avg ?? 0), 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [monthlyTrends, currency, fxRate, convertAmount])

  // Monthly spend vs 3M average
  const monthlyVs3M = useMemo(() => {
    if (threeMonthAvg === 0) return null
    return currentMonthlySpend - threeMonthAvg
  }, [currentMonthlySpend, threeMonthAvg])

  const monthlyVs3MPercent = useMemo(() => {
    if (!monthlyVs3M || threeMonthAvg === 0) return null
    return (monthlyVs3M / Math.abs(threeMonthAvg)) * 100
  }, [monthlyVs3M, threeMonthAvg])

  // Monthly spend drivers (categories with biggest changes vs 3M avg)
  const monthlyDrivers = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const categoryDiffs = expenses
      .map((m) => {
        const curEstGBP = Math.abs(m.cur_month_est ?? 0)
        const avgGBP = Math.abs(m.ttm_avg ?? 0)
        const diffGBP = curEstGBP - avgGBP
        return {
          category: m.category,
          diffGBP,
          diff: currency === 'USD' ? convertAmount(diffGBP, 'GBP', fxRate) : diffGBP,
        }
      })
      .filter((item) => Math.abs(item.diffGBP) > 50) // Filter small changes
      .sort((a, b) => Math.abs(b.diffGBP) - Math.abs(a.diffGBP))

    const spendingMore = categoryDiffs.filter((item) => item.diffGBP < 0).slice(0, 3)
    const spendingLess = categoryDiffs.filter((item) => item.diffGBP > 0).slice(0, 3)

    return { spendingMore, spendingLess }
  }, [monthlyTrends, currency, fxRate, convertAmount])

  const formatCurrency = (value: number) => {
    const abs = Math.abs(value)
    const symbol = currency === 'USD' ? '$' : '£'
    if (abs >= 1_000_000) {
      return `${symbol}${(value / 1_000_000).toFixed(1)}M`
    }
    if (abs >= 1_000) {
      return `${symbol}${(value / 1_000).toFixed(1)}K`
    }
    return `${symbol}${Math.round(value)}`
  }

  const formatPercent = (value: number) => {
    const abs = Math.abs(value)
    if (abs < 0.1) return '<0.1%'
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    onOpenChange(false)
  }

  const formatLastSync = () => {
    if (!lastSyncDate) return null
    const date = new Date(lastSyncDate)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    }
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    }
    const diffMins = Math.floor(diffMs / (1000 * 60))
    return diffMins < 1 ? 'Just now' : `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-xl font-bold">Daily Financial Summary</DialogTitle>
          <DialogDescription className="text-xs">
            {lastSyncDate ? `Last updated: ${formatLastSync()}` : 'Overview of your financial position'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Annual Spend & Gap to Budget */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Annual Est. Spend</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums">
                    {formatCurrency(annualEstimatedSpend)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Gap to Budget</span>
                  </div>
                  <div className={cn(
                    'text-xl font-bold tabular-nums',
                    gapToBudget >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {gapToBudget >= 0 ? 'Under' : 'Over'} {formatCurrency(Math.abs(gapToBudget))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Change Since Yesterday */}
            {yesterdayChange !== null && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Change Since Yesterday</span>
                  </div>
                  <div className={cn(
                    'text-lg font-bold tabular-nums mb-2',
                    yesterdayChange < 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {yesterdayChange < 0 ? (
                      <span className="flex items-center gap-1.5">
                        <TrendingDown className="h-4 w-4" />
                        Gap improved by {formatCurrency(Math.abs(yesterdayChange))}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4" />
                        Gap worsened by {formatCurrency(Math.abs(yesterdayChange))}
                      </span>
                    )}
                  </div>
                  {(topDrivers.underBudgetDrivers.length > 0 || topDrivers.overBudgetDrivers.length > 0) && (
                    <div className="space-y-0.5">
                      {gapToBudget >= 0 ? (
                        <div className="grid grid-cols-2 gap-3 mb-1.5">
                          {/* When under budget, show under budget drivers on left */}
                          {topDrivers.underBudgetDrivers.length > 0 && (
                            <div>
                              <div className="text-[10px] font-bold text-green-600 mb-1">Top Drivers of Under Budget:</div>
                              {topDrivers.underBudgetDrivers.map((driver) => (
                                <div key={driver.category} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground font-medium">{driver.category}</span>
                                  <span className="font-medium tabular-nums text-green-600">
                                    {formatCurrency(Math.abs(driver.delta))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {topDrivers.overBudgetDrivers.length > 0 && (
                            <div>
                              <div className="text-[10px] font-bold text-red-600 mb-1">Top Drivers of Over Budget:</div>
                              {topDrivers.overBudgetDrivers.map((driver) => (
                                <div key={driver.category} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground font-medium">{driver.category}</span>
                                  <span className="font-medium tabular-nums text-red-600">
                                    {formatCurrency(Math.abs(driver.delta))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="text-[10px] font-bold text-muted-foreground mb-1.5">Top Drivers:</div>
                          {[...topDrivers.underBudgetDrivers, ...topDrivers.overBudgetDrivers]
                            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                            .slice(0, 3)
                            .map((driver) => (
                              <div key={driver.category} className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground font-medium">{driver.category}</span>
                                <span className={cn(
                                  'font-medium tabular-nums',
                                  driver.delta < 0 ? 'text-green-600' : 'text-red-600'
                                )}>
                                  {formatCurrency(Math.abs(driver.delta))}
                                </span>
                              </div>
                            ))}
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Monthly Spend & 3M Comparison */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Est. This Month</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums">
                    {formatCurrency(currentMonthlySpend)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">vs 3M Avg</span>
                  </div>
                  {monthlyVs3M !== null ? (
                    <div className={cn(
                      'text-xl font-bold tabular-nums',
                      monthlyVs3M >= 0 ? 'text-red-600' : 'text-green-600'
                    )}>
                      {monthlyVs3M >= 0 ? '+' : ''}{formatCurrency(monthlyVs3M)}
                      {monthlyVs3MPercent !== null && (
                        <span className="text-xs font-normal ml-1">
                          ({formatPercent(monthlyVs3MPercent)})
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No comparison</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Monthly Spend Drivers */}
            {(monthlyDrivers.spendingMore.length > 0 || monthlyDrivers.spendingLess.length > 0) && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Monthly Spend Drivers</div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* When monthly spend decreased vs 3M avg, show "Spending Less" on left */}
                    {monthlyVs3M !== null && monthlyVs3M < 0 ? (
                      <>
                        {monthlyDrivers.spendingLess.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold text-green-600 mb-1">Spending Less:</div>
                            <div className="space-y-0.5">
                              {monthlyDrivers.spendingLess.map((driver) => (
                                <div key={driver.category} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground font-medium">{driver.category}</span>
                                  <span className="font-medium text-green-600 tabular-nums">
                                    {formatCurrency(Math.abs(driver.diff))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {monthlyDrivers.spendingMore.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold text-red-600 mb-1">Spending More:</div>
                            <div className="space-y-0.5">
                              {monthlyDrivers.spendingMore.map((driver) => (
                                <div key={driver.category} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground font-medium">{driver.category}</span>
                                  <span className="font-medium text-red-600 tabular-nums">
                                    {formatCurrency(Math.abs(driver.diff))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {monthlyDrivers.spendingMore.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold text-red-600 mb-1">Spending More:</div>
                            <div className="space-y-0.5">
                              {monthlyDrivers.spendingMore.map((driver) => (
                                <div key={driver.category} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground font-medium">{driver.category}</span>
                                  <span className="font-medium text-red-600 tabular-nums">
                                    {formatCurrency(Math.abs(driver.diff))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {monthlyDrivers.spendingLess.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold text-green-600 mb-1">Spending Less:</div>
                            <div className="space-y-0.5">
                              {monthlyDrivers.spendingLess.map((driver) => (
                                <div key={driver.category} className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground font-medium">{driver.category}</span>
                                  <span className="font-medium text-green-600 tabular-nums">
                                    {formatCurrency(Math.abs(driver.diff))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              className="h-4 w-4"
            />
            <Label
              htmlFor="dont-show-again"
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Don't show again
            </Label>
          </div>
          <Button onClick={handleClose} size="sm" className="w-full sm:w-auto">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Hook to check if modal should be shown
export function shouldShowDailySummary(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) !== 'true'
}
