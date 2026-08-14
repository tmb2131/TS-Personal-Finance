'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes, getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { BudgetTarget, InvestmentReturn } from '@/lib/types'
import { useBudgets } from '@/lib/hooks/queries/use-budgets'
import { useInvestmentReturns } from '@/lib/hooks/queries/use-investment-returns'
import {
  computeAnnualForecasts,
  type AnnualForecastEntry,
  type AnnualForecastRecord,
} from '@/lib/forecasting'
import { isExcludedCategory } from '@/lib/category-filters'
import { AlertCircle } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

// Green/teal shades for income stack (dark → light)
const INCOME_INVESTMENT_FILL = '#166534'
const INCOME_FILL = '#22c55e'
const GIFT_MONEY_FILL = '#86efac'
// Muted expense color (slate) – integrated, not alarming
const EXPENSES_FILL = '#64748b'

export interface IncomeVsExpensesChartInitialData {
  budgets: BudgetTarget[]
  investmentReturns: InvestmentReturn[]
  initialAnnualForecasts?: AnnualForecastRecord
}

interface IncomeVsExpensesChartProps {
  initialData?: IncomeVsExpensesChartInitialData
}

export function IncomeVsExpensesChart({ initialData }: IncomeVsExpensesChartProps = {}) {
  const { currency, fxRate } = useCurrency()
  const hasInitial = Boolean(initialData)
  const initialAnnualForecasts = initialData?.initialAnnualForecasts
  const [loading, setLoading] = useState(!hasInitial)
  const [error, setError] = useState<string | null>(null)
  const [budgets, setBudgets] = useState<BudgetTarget[]>(initialData?.budgets ?? [])
  const [investmentReturns, setInvestmentReturns] = useState<InvestmentReturn[]>(initialData?.investmentReturns ?? [])
  const [forecastByCategory, setForecastByCategory] = useState<Map<string, AnnualForecastEntry> | null>(() =>
    initialAnnualForecasts !== undefined ? new Map(Object.entries(initialAnnualForecasts)) : null
  )
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const [mounted, setMounted] = useState(false)
  const [includeInvestmentIncome, setIncludeInvestmentIncome] = useState(false)
  const fontSizes = getChartFontSizes(isMobile)

  const { data: queryBudgets } = useBudgets()
  const { data: queryInvestmentReturns } = useInvestmentReturns()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (hasInitial && initialData) {
      setBudgets(initialData.budgets)
      setInvestmentReturns(initialData.investmentReturns)
      setLoading(false)
      return
    }

    const budgetList = queryBudgets as BudgetTarget[] | undefined
    const investmentList = queryInvestmentReturns as InvestmentReturn[] | undefined
    if (!budgetList || !investmentList) return

    async function applyQueryData() {
      setBudgets(budgetList!)
      setInvestmentReturns(investmentList!)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const forecasts = await computeAnnualForecasts(supabase, user.id)
        setForecastByCategory(forecasts)
      }
      setError(null)
      setLoading(false)
    }
    applyQueryData()
  }, [hasInitial, initialData, queryBudgets, queryInvestmentReturns])

  useEffect(() => {
    if (initialAnnualForecasts === undefined) return
    setForecastByCategory(new Map(Object.entries(initialAnnualForecasts)))
  }, [initialAnnualForecasts])

  useEffect(() => {
    if (initialAnnualForecasts !== undefined) return
    let cancelled = false
    async function fetchForecasts() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const forecasts = await computeAnnualForecasts(supabase, user.id)
      if (!cancelled) setForecastByCategory(forecasts)
    }
    fetchForecasts()
    return () => {
      cancelled = true
    }
  }, [initialAnnualForecasts])

  const chartData = useMemo(() => {
    const toDisplay = (gbp: number) => (currency === 'USD' ? gbp * fxRate : gbp)
    let investmentIncome = 0
    if (includeInvestmentIncome) {
      investmentReturns.forEach((r) => {
        investmentIncome += toDisplay(r.amount_gbp || 0)
      })
    }
    let income = 0
    let giftMoney = 0
    let expenses = 0
    budgets.forEach((b) => {
      if (isExcludedCategory(b.category)) return
      const forecast = forecastByCategory?.get(b.category)?.forecast ?? b.annual_budget_gbp ?? 0
      const tracking = currency === 'USD' ? forecast * fxRate : forecast
      if (b.category === 'Income') income += Math.abs(tracking)
      else if (b.category === 'Gift Money') giftMoney += Math.abs(tracking)
      else expenses += Math.abs(tracking)
    })
    return [
      {
        name: 'Income',
        'Investment Income': Math.round(investmentIncome),
        'Income': Math.round(income),
        'Gift Money': Math.round(giftMoney),
        'Expenses': 0,
      },
      {
        name: 'Expenses',
        'Investment Income': 0,
        'Income': 0,
        'Gift Money': 0,
        'Expenses': Math.round(expenses),
      },
    ]
  }, [budgets, investmentReturns, currency, fxRate, includeInvestmentIncome, forecastByCategory])

  if (loading) {
    return (
      <Card className="border-l-[3px] border-l-positive">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Income & Expenses</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">For {new Date().getFullYear()} (All amounts are after tax)</p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-l-[3px] border-l-positive">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Income & Expenses</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">For {new Date().getFullYear()} (All amounts are after tax)</p>
        </CardHeader>
        <CardContent>
          <EmptyState icon={AlertCircle} title="Error loading data" description={error} />
        </CardContent>
      </Card>
    )
  }

  // Defer chart render until after mount to avoid hydration mismatch (isMobile / Recharts differ server vs client)
  if (!mounted) {
    return (
      <Card className="border-l-[3px] border-l-positive">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Income & Expenses</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">For {new Date().getFullYear()} (All amounts are after tax)</p>
        </CardHeader>
        <CardContent className="pt-6 md:pt-6">
          <div className="flex flex-wrap gap-4 mb-6 pb-4 border-b">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 rounded border border-input" />
              <span className="text-sm">Include Investment Income</span>
            </div>
          </div>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-[3px] border-l-positive">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Est. Income & Expenses</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">For {new Date().getFullYear()} (All amounts are after tax)</p>
        </CardHeader>
      <CardContent className="pt-6 md:pt-6">
        <div className="flex flex-wrap gap-4 mb-6 pb-4 border-b">
          <div className="hidden sm:flex items-center space-x-2">
            <Checkbox
              id="filter-investment-income"
              checked={includeInvestmentIncome}
              onCheckedChange={(checked) => setIncludeInvestmentIncome(checked === true)}
            />
            <Label htmlFor="filter-investment-income" className="text-sm font-normal cursor-pointer">
              Include Investment Income
            </Label>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
          <BarChart
            data={chartData}
            margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 5 }}
            barCategoryGap="10%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              tickCount={isMobile ? 5 : undefined}
              interval={isMobile ? 'preserveStartEnd' : undefined}
            />
            <YAxis
              tickFormatter={(value) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                  notation: 'compact',
                  maximumFractionDigits: 0,
                }).format(value)
              }
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              width={isMobile ? 60 : 80}
            />
            <Tooltip
              wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
              formatter={(value: number) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                }).format(value)
              }
              contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: fontSizes.tooltipMin, isMobile })}
            />
            <Legend
              wrapperStyle={{
                width: '100%',
                paddingTop: isMobile ? '10px' : '20px',
                fontSize: fontSizes.legend,
              }}
              iconType="square"
              iconSize={fontSizes.iconSize}
              formatter={(value) => (
                <span style={{ fontSize: fontSizes.legend, marginRight: isMobile ? '16px' : '24px' }}>
                  {value}
                </span>
              )}
            />
            {includeInvestmentIncome && (
              <Bar
                dataKey="Investment Income"
                stackId="income"
                fill={INCOME_INVESTMENT_FILL}
                radius={[4, 4, 0, 0]}
                stroke="#fff"
                strokeWidth={1}
              />
            )}
            <Bar dataKey="Income" stackId="income" fill={INCOME_FILL} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
            <Bar dataKey="Gift Money" stackId="income" fill={GIFT_MONEY_FILL} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
            <Bar dataKey="Expenses" stackId="income" fill={EXPENSES_FILL} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
