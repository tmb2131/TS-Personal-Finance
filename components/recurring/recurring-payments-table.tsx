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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCurrency } from '@/lib/contexts/currency-context'
import { createClient } from '@/lib/supabase/client'
import { RecurringPayment } from '@/lib/types'
import { AlertCircle, Flag, FlagOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from 'sonner'

interface AggregatedRecurringPayment {
  name: string
  annualizedAmount: number
  ids: string[]
  needsReview: boolean
}

export function RecurringPaymentsTable() {
  const { currency, fxRate } = useCurrency()
  const [payments, setPayments] = useState<RecurringPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch recurring payments
  useEffect(() => {
    async function fetchPayments() {
      setLoading(true)
      const supabase = createClient()

      try {
        const { data, error: fetchError } = await supabase
          .from('recurring_payments')
          .select('*')
          .order('name', { ascending: true })

        if (fetchError) {
          throw new Error(`Failed to fetch recurring payments: ${fetchError.message}`)
        }

        setPayments((fetchError ? [] : (data as RecurringPayment[])) || [])
        setError(null)
      } catch (err) {
        console.error('Error fetching recurring payments:', err)
        setError(err instanceof Error ? err.message : 'Failed to load recurring payments data')
      } finally {
        setLoading(false)
      }
    }

    fetchPayments()
  }, [])

  // Aggregate payments by name (case-insensitive, trimmed)
  const aggregatedPayments = useMemo(() => {
    const grouped = new Map<string, AggregatedRecurringPayment>()

    payments.forEach((payment) => {
      const normalizedName = (payment.name || '').toLowerCase().trim()
      
      // Get amount in selected currency: prefer native value, convert the other if missing
      const amount =
        currency === 'USD'
          ? (payment.annualized_amount_usd != null
              ? payment.annualized_amount_usd
              : (payment.annualized_amount_gbp ?? 0) * fxRate)
          : (payment.annualized_amount_gbp != null
              ? payment.annualized_amount_gbp
              : (payment.annualized_amount_usd ?? 0) / (fxRate || 1))
      
      if (grouped.has(normalizedName)) {
        const existing = grouped.get(normalizedName)!
        // Sum the amounts (both should be in the same currency now)
        existing.annualizedAmount += amount
        existing.ids.push(payment.id)
        // If any payment needs review, mark the aggregated one as needing review
        if (payment.needs_review) {
          existing.needsReview = true
        }
      } else {
        grouped.set(normalizedName, {
          name: payment.name.trim(), // Use original casing from first occurrence
          annualizedAmount: amount,
          ids: [payment.id],
          needsReview: payment.needs_review || false,
        })
      }
    })

    return Array.from(grouped.values())
      .sort((a, b) => Math.abs(b.annualizedAmount) - Math.abs(a.annualizedAmount)) // Sort descending by amount
  }, [payments, currency, fxRate])

  // Calculate total spend and 80% threshold
  const { totalSpend, threshold80Percent } = useMemo(() => {
    const total = aggregatedPayments.reduce((sum, payment) => sum + Math.abs(payment.annualizedAmount), 0)
    return {
      totalSpend: total,
      threshold80Percent: total * 0.8,
    }
  }, [aggregatedPayments])

  // Calculate cumulative totals and identify top 80% payments
  const paymentsWithCumulative = useMemo(() => {
    let cumulative = 0
    return aggregatedPayments.map((payment) => {
      cumulative += Math.abs(payment.annualizedAmount)
      return {
        ...payment,
        cumulative,
        isTop80Percent: cumulative <= threshold80Percent,
      }
    })
  }, [aggregatedPayments, threshold80Percent])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const toggleReviewFlag = async (name: string, currentlyFlagged: boolean) => {
    const supabase = createClient()
    const normalizedName = name.toLowerCase().trim()

    try {
      // Find all payments with this name
      const { data: matchingPayments } = await supabase
        .from('recurring_payments')
        .select('id')
        .ilike('name', normalizedName)

      if (!matchingPayments || matchingPayments.length === 0) {
        throw new Error('No matching payments found')
      }

      // Update all matching payments
      const { error: updateError } = await supabase
        .from('recurring_payments')
        .update({ needs_review: !currentlyFlagged })
        .in('id', matchingPayments.map((p) => p.id))

      if (updateError) {
        throw updateError
      }

      // Refresh payments
      const { data: updatedPayments } = await supabase
        .from('recurring_payments')
        .select('*')
        .order('name', { ascending: true })

      if (updatedPayments) {
        setPayments(updatedPayments as RecurringPayment[])
      }

      toast.success(
        currentlyFlagged
          ? 'Review flag removed'
          : 'Payment flagged for review'
      )
    } catch (err) {
      console.error('Error updating review flag:', err)
      toast.error('Failed to update review flag')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recurring Payments (Google Sheet)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recurring Payments (Google Sheet)</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={AlertCircle} title="Error loading data" description={error} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring Payments (Google Sheet)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Manually tracked recurring payments from Google Sheet
        </p>
      </CardHeader>
      <CardContent>
        {paymentsWithCumulative.length > 0 ? (
          <div className="hidden md:block relative max-h-[600px] overflow-auto border rounded-md">
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="sticky top-0 z-20 bg-background">Name</TableHead>
                  <TableHead className="sticky top-0 z-20 text-right bg-background">Annualized Amount</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentsWithCumulative.map((payment, index) => {
                  return (
                    <TableRow
                      key={`${payment.name}-${index}`}
                      className={cn(
                        payment.isTop80Percent && 'bg-yellow-50 dark:bg-yellow-950/20'
                      )}
                    >
                      <TableCell className="font-medium">
                        {payment.name}
                        {payment.isTop80Percent && (
                          <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400 font-semibold">
                            (Top 80%)
                          </span>
                        )}
                        {payment.needsReview && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Review
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.annualizedAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleReviewFlag(payment.name, payment.needsReview)}
                          className={cn(
                            payment.needsReview && 'text-orange-600 dark:text-orange-400'
                          )}
                        >
                          {payment.needsReview ? (
                            <>
                              <FlagOff className="h-4 w-4 mr-2" />
                              Remove Flag
                            </>
                          ) : (
                            <>
                              <Flag className="h-4 w-4 mr-2" />
                              Flag for Review
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={AlertCircle}
            title="No recurring payments found"
            description="No recurring payments data found in the Google Sheet."
          />
        )}
      </CardContent>
    </Card>
  )
}
