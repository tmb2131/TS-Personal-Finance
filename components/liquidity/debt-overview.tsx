'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance, Debt } from '@/lib/types'
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
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { AlertCircle, ListIcon } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

export default function DebtOverview() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [totalDebt, setTotalDebt] = useState(0)
  const [totalAssets, setTotalAssets] = useState(0)
  const [debtRatio, setDebtRatio] = useState<number | null>(null)
  const [debtItems, setDebtItems] = useState<Debt[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      // Fetch debt (excluding Committed Capital)
      const { data: debts } = await supabase
        .from('debt')
        .select('*')
        .neq('type', 'Committed Capital')

      // Fetch account balances for assets calculation
      const { data: accounts } = await supabase
        .from('account_balances')
        .select('*')
        .order('date_updated', { ascending: false })

      if (!debts || !accounts) {
        setLoading(false)
        return
      }

      // Store debt items for dialog
      setDebtItems(debts)

      // Calculate total debt
      let debt = 0
      debts.forEach((debtItem: Debt) => {
        const amount =
          (currency === 'USD' ? debtItem.amount_usd : debtItem.amount_gbp) ?? 0
        debt += amount
      })

      // Deduplicate accounts by institution + account_name
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

      // Calculate total assets (excluding debt-related accounts)
      let assets = 0
      latestAccounts.forEach((account) => {
        const amount = convertAmount(
          account.balance_total_local ?? 0,
          account.currency ?? 'USD',
          fxRate
        )
        assets += amount
      })

      setTotalDebt(debt)
      setTotalAssets(assets)

      // Calculate debt ratio
      if (assets > 0) {
        setDebtRatio((debt / assets) * 100)
      }

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

  const formatPercent = (value: number | null) => {
    if (value === null) return 'N/A'
    return `${value.toFixed(1)}%`
  }

  const chartData = [
    { name: 'Total Debt', value: totalDebt, color: '#ef4444' },
    { name: 'Total Assets', value: totalAssets, color: '#10b981' },
  ]

  const fontSizes = getChartFontSizes(isMobile)
  const chartHeight = isMobile ? 260 : 320

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Debt vs Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center"
            style={{ height: chartHeight }}
          >
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (totalDebt === 0 && totalAssets === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Debt vs Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex flex-col items-center justify-center gap-2"
            style={{ height: chartHeight }}
          >
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
        <CardTitle>Debt vs Assets</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <ListIcon className="h-4 w-4 mr-2" />
              View Details
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Debt Line Items</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              {debtItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No debt items found
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtItems.map((item, index) => {
                      const amount =
                        (currency === 'USD'
                          ? item.amount_usd
                          : item.amount_gbp) ?? 0
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {item.type}
                          </TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {item.purpose || '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(amount)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {item.date_updated
                              ? new Date(item.date_updated).toLocaleDateString()
                              : '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            margin={
              isMobile
                ? { top: 10, right: 10, left: 0, bottom: 5 }
                : { top: 20, right: 30, left: 20, bottom: 5 }
            }
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: fontSizes.axisTick }}
              width={isMobile ? 48 : 60}
              stroke="#6b7280"
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Bar dataKey="value">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Total Debt</p>
            <p className="text-lg font-bold tabular-nums">
              {formatCurrency(totalDebt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Debt Ratio</p>
            <p className="text-lg font-bold tabular-nums">
              {formatPercent(debtRatio)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
