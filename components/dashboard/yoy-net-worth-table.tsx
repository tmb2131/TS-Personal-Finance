'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrency } from '@/lib/contexts/currency-context'
import { createClient } from '@/lib/supabase/client'
import { YoYNetWorth } from '@/lib/types'
import { AlertCircle, ArrowUpDown, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'

type SortField = 'category' | 'amount'
type SortDirection = 'asc' | 'desc'

export function YoYNetWorthTable() {
  const { currency } = useCurrency()
  const [data, setData] = useState<YoYNetWorth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('category')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: netWorthData, error } = await supabase
        .from('yoy_net_worth')
        .select('*')
        .order('category')

      if (error) {
        console.error('Error fetching YoY Net Worth:', error)
        setError('Failed to load year-over-year net worth data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      
      setError(null)

      setData((netWorthData as YoYNetWorth[]) || [])
      setLoading(false)
    }

    fetchData()
  }, [])

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-'
    const valueInK = Math.abs(value) / 1000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    if (valueInK < 10) {
      return `${currencySymbol}${valueInK.toFixed(1)}k`
    }
    return `${currencySymbol}${Math.round(valueInK)}k`
  }

  const formatCurrencyLarge = (value: number | null) => {
    if (value === null || value === undefined) return '-'
    const valueInM = Math.abs(value) / 1000000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    if (valueInM >= 1) {
      return `${currencySymbol}${valueInM.toFixed(1)}M`
    }
    return formatCurrency(value)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      let aValue: number | string
      let bValue: number | string

      switch (sortField) {
        case 'category':
          aValue = a.category
          bValue = b.category
          break
        case 'amount':
          aValue = currency === 'USD' ? (a.amount_usd || 0) : (a.amount_gbp || 0)
          bValue = currency === 'USD' ? (b.amount_usd || 0) : (b.amount_gbp || 0)
          break
        default:
          return 0
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return sortDirection === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
    })

    return sorted
  }, [data, sortField, sortDirection, currency])

  // Calculate totals
  const totals = useMemo(() => {
    return sortedData.reduce(
      (acc, item) => {
        const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
        return acc + (amount || 0)
      },
      0
    )
  }, [sortedData, currency])

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <CardTitle className="text-base">Year-over-Year Net Worth Change</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading data"
            description={error}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
        <CardTitle className="text-base">Year-over-Year Net Worth Change</CardTitle>
      </CardHeader>
      <CardContent>
        <Table className="[&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-medium [&_td]:text-[13px] [&_td]:tabular-nums">
          <TableHeader>
            <TableRow className="bg-muted">
              <TableHead
                className={cn('cursor-pointer hover:bg-muted/80 bg-muted', sortField === 'category' && 'bg-gray-200 dark:bg-gray-700')}
                onClick={() => handleSort('category')}
              >
                <div className={cn('flex items-center gap-2', sortField === 'category' && 'font-semibold')}>
                  Category
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
              <TableHead
                className={cn('cursor-pointer hover:bg-muted/80 bg-muted text-right', sortField === 'amount' && 'bg-gray-200 dark:bg-gray-700')}
                onClick={() => handleSort('amount')}
              >
                <div className={cn('flex items-center justify-end gap-2', sortField === 'amount' && 'font-semibold')}>
                  Amount ({currency})
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => {
              const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
              const isTotal = item.category === 'Year End' || item.category === 'Year Start'
              const isNegative = amount !== null && amount < 0
              
              return (
                <TableRow key={item.id}>
                  <TableCell className={cn(isTotal && 'font-semibold')}>
                    {item.category}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      isTotal && 'font-semibold',
                      isNegative ? 'text-red-600' : amount !== null && amount > 0 ? 'text-green-600' : ''
                    )}
                  >
                    {amount !== null ? formatCurrencyLarge(amount) : '-'}
                  </TableCell>
                </TableRow>
              )
            })}
            {sortedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="p-0">
                  <EmptyState
                    icon={TrendingUp}
                    title="No net worth data available"
                    description="Year-over-year net worth data has not been synced yet."
                    className="py-8"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
