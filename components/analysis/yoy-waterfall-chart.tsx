'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { createClient } from '@/lib/supabase/client'
import { HistoricalNetWorth, TransactionLog } from '@/lib/types'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'

export function YoYWaterfallChart() {
  const { currency } = useCurrency()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      const currentYear = new Date().getFullYear()
      const startOfYear = new Date(currentYear, 0, 1)
      
      const [netWorthResult, transactionsResult] = await Promise.all([
        supabase
          .from('historical_net_worth')
          .select('*')
          .gte('date', startOfYear.toISOString())
          .order('date', { ascending: true }),
        supabase
          .from('transaction_log')
          .select('*')
          .gte('date', startOfYear.toISOString())
          .order('date', { ascending: true }),
      ])

      if (netWorthResult.error || transactionsResult.error) {
        console.error('Error fetching YoY data:', netWorthResult.error || transactionsResult.error)
        setLoading(false)
        return
      }

      // Calculate start net worth (Jan 1)
      const startNW = netWorthResult.data
        .filter((nw: HistoricalNetWorth) => {
          const date = new Date(nw.date)
          return date.getMonth() === 0 && date.getDate() === 1
        })
        .reduce((sum: number, nw: HistoricalNetWorth) => {
          const amount = currency === 'USD' ? nw.amount_usd : nw.amount_gbp
          return sum + (amount || 0)
        }, 0)

      // Calculate current net worth
      const currentNW = netWorthResult.data
        .slice(-1)[0]
        ? (currency === 'USD' 
            ? (netWorthResult.data.slice(-1)[0] as HistoricalNetWorth).amount_usd 
            : (netWorthResult.data.slice(-1)[0] as HistoricalNetWorth).amount_gbp) || 0
        : startNW

      // Calculate income (positive transactions)
      const income = transactionsResult.data
        .filter((t: TransactionLog) => {
          const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
          return amount && amount > 0
        })
        .reduce((sum: number, t: TransactionLog) => {
          const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
          return sum + (amount || 0)
        }, 0)

      // Calculate expenses (negative transactions)
      const expenses = Math.abs(
        transactionsResult.data
          .filter((t: TransactionLog) => {
            const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
            return amount && amount < 0
          })
          .reduce((sum: number, t: TransactionLog) => {
            const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
            return sum + (amount || 0)
          }, 0)
      )

      // Calculate investment gains (net worth change minus income/expenses)
      const investmentGains = currentNW - startNW - income + expenses

      const waterfallData = [
        { name: 'Start (Jan 1)', value: startNW, type: 'start' },
        { name: 'Income', value: income, type: 'income' },
        { name: 'Expenses', value: -expenses, type: 'expenses' },
        { name: 'Investment Gains', value: investmentGains, type: 'gains' },
        { name: 'End (Current)', value: currentNW, type: 'end' },
      ]

      setData(waterfallData)
      setLoading(false)
    }

    fetchData()
  }, [currency])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Year-over-Year Net Worth Change</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getBarColor = (type: string) => {
    switch (type) {
      case 'start':
      case 'end':
        return '#8884d8'
      case 'income':
      case 'gains':
        return '#82ca9d'
      case 'expenses':
        return '#ff7c7c'
      default:
        return '#8884d8'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Year-over-Year Net Worth Change</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis
              tickFormatter={(value) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                  notation: 'compact',
                }).format(value)
              }
            />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                }).format(value)
              }
            />
            <Legend />
            <Bar dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.type)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
