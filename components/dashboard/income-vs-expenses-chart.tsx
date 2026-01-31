'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { BudgetTarget, InvestmentReturn } from '@/lib/types'
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
}

interface IncomeVsExpensesChartProps {
  initialData?: IncomeVsExpensesChartInitialData
}

export function IncomeVsExpensesChart({ initialData }: IncomeVsExpensesChartProps = {}) {
  const { currency, fxRate } = useCurrency()
  const hasInitial = Boolean(initialData)
  const [loading, setLoading] = useState(!hasInitial)
  const [error, setError] = useState<string | null>(null)
  const [budgets, setBudgets] = useState<BudgetTarget[]>(initialData?.budgets ?? [])
  const [investmentReturns, setInvestmentReturns] = useState<InvestmentReturn[]>(initialData?.investmentReturns ?? [])
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [includeInvestmentIncome, setIncludeInvestmentIncome] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const fontSizes = getChartFontSizes(isMobile)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [mounted])

  useEffect(() => {
    if (hasInitial && initialData) {
      setBudgets(initialData.budgets)
      setInvestmentReturns(initialData.investmentReturns)
      setLoading(false)
      return
    }

    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      const [budgetsRes, investmentRes] = await Promise.all([
        supabase.from('budget_targets').select('*'),
        supabase.from('investment_return').select('*'),
      ])
      if (budgetsRes.error) {
        setError(budgetsRes.error.message)
        setLoading(false)
        return
      }
      if (investmentRes.error) {
        setError(investmentRes.error.message)
        setLoading(false)
        return
      }
      const budgetList = (budgetsRes.data as BudgetTarget[]) || []
      const investmentList = (investmentRes.data as InvestmentReturn[]) || []
      setBudgets(budgetList)
      setInvestmentReturns(investmentList)
      setError(null)
      setLoading(false)

      // Retry once if we got empty data (session may not have been ready on first load)
      if (retryCount === 0 && budgetList.length === 0 && investmentList.length === 0) {
        setTimeout(() => setRetryCount(1), 500)
      }
    }
    fetchData()
  }, [hasInitial, retryCount, initialData])

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
      const tracking = currency === 'USD' ? (b.tracking_est_gbp ?? 0) * fxRate : (b.tracking_est_gbp ?? 0)
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
  }, [budgets, investmentReturns, currency, fxRate, includeInvestmentIncome])

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Est. Income & Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Est. Income & Expenses</CardTitle>
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
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Est. Income & Expenses</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Current year (tracking)</p>
        </CardHeader>
        <CardContent className="pt-8">
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
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Est. Income & Expenses</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">Current year (tracking)</p>
      </CardHeader>
      <CardContent className="pt-8">
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
            margin={{ top: 36, right: 30, left: 20, bottom: 24 }}
            barCategoryGap="10%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
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
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 60 : 80}
            />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                }).format(value)
              }
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: isMobile ? '6px 10px' : '8px 12px',
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
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
