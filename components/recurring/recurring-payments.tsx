'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { TransactionLog, RecurringPreference } from '@/lib/types'
import { useCurrency } from '@/lib/contexts/currency-context'
import { detectRecurringPayments, DetectedRecurringPayment } from '@/lib/utils/detect-recurring-payments'
import { AlertCircle, Calendar, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from 'sonner'

export function RecurringPayments() {
  const { currency, fxRate } = useCurrency()
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [preferences, setPreferences] = useState<RecurringPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch transactions and preferences
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      try {
        // Fetch transactions from last 12 months
        const twelveMonthsAgo = new Date()
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
        const startDateStr = twelveMonthsAgo.toISOString().split('T')[0]

        // Fetch all transactions with pagination
        let allTransactions: TransactionLog[] = []
        let page = 0
        const pageSize = 1000
        let hasMore = true

        while (hasMore) {
          const from = page * pageSize
          const to = from + pageSize - 1

          const transactionsResult = await supabase
            .from('transaction_log')
            .select('*')
            .gte('date', startDateStr)
            .order('date', { ascending: true })
            .range(from, to)

          if (transactionsResult.error) {
            throw new Error(`Failed to fetch transactions: ${transactionsResult.error.message}`)
          }

          const pageTransactions = transactionsResult.data || []
          allTransactions = [...allTransactions, ...pageTransactions]
          hasMore = pageTransactions.length === pageSize
          page++
        }

        // Fetch preferences
        const preferencesResult = await supabase
          .from('recurring_preferences')
          .select('*')

        if (preferencesResult.error) {
          throw new Error(`Failed to fetch preferences: ${preferencesResult.error.message}`)
        }

        setTransactions(allTransactions)
        setPreferences((preferencesResult.data as RecurringPreference[]) || [])
        setError(null)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load recurring payments data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Detect recurring payments
  const detectedPayments = useMemo(() => {
    if (!transactions.length) return []
    return detectRecurringPayments(transactions, currency, fxRate)
  }, [transactions, currency, fxRate])

  // Filter out ignored payments and separate by frequency
  const { monthlyPayments, yearlyPayments } = useMemo(() => {
    const ignoredPatterns = new Set(
      preferences.filter((p) => p.is_ignored).map((p) => p.counterparty_pattern.toLowerCase())
    )

    const active = detectedPayments.filter(
      (payment) => !ignoredPatterns.has(payment.counterpartyPattern.toLowerCase())
    )
    const ignored = detectedPayments.filter(
      (payment) => ignoredPatterns.has(payment.counterpartyPattern.toLowerCase())
    )

    const activeMonthly = active.filter((p) => p.frequency === 'Monthly')
    const activeYearly = active.filter((p) => p.frequency === 'Yearly')
    const ignoredMonthly = ignored.filter((p) => p.frequency === 'Monthly')
    const ignoredYearly = ignored.filter((p) => p.frequency === 'Yearly')

    // Sort active by next expected date, ignored at the end
    return {
      monthlyPayments: [...activeMonthly, ...ignoredMonthly],
      yearlyPayments: [...activeYearly, ...ignoredYearly],
    }
  }, [detectedPayments, preferences])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const toggleIgnore = async (pattern: string, currentlyIgnored: boolean) => {
    const supabase = createClient()
    const normalizedPattern = pattern.toLowerCase()

    try {
      // Check if preference exists
      const { data: existing } = await supabase
        .from('recurring_preferences')
        .select('*')
        .eq('counterparty_pattern', normalizedPattern)
        .single()

      if (existing) {
        // Update existing preference
        const { error } = await supabase
          .from('recurring_preferences')
          .update({ is_ignored: !currentlyIgnored })
          .eq('counterparty_pattern', normalizedPattern)

        if (error) throw error
      } else {
        // Create new preference
        const { error } = await supabase
          .from('recurring_preferences')
          .insert({
            counterparty_pattern: normalizedPattern,
            is_ignored: !currentlyIgnored,
          })

        if (error) throw error
      }

      // Refresh preferences
      const { data: updatedPreferences } = await supabase
        .from('recurring_preferences')
        .select('*')

      if (updatedPreferences) {
        setPreferences(updatedPreferences as RecurringPreference[])
      }

      toast.success(
        currentlyIgnored
          ? 'Payment restored to active list'
          : 'Payment marked as not recurring'
      )
    } catch (err) {
      console.error('Error updating preference:', err)
      toast.error('Failed to update preference')
    }
  }

  const isIgnored = (pattern: string): boolean => {
    return preferences.some(
      (p) => p.counterparty_pattern.toLowerCase() === pattern.toLowerCase() && p.is_ignored
    )
  }

  const PaymentCard = ({ payment }: { payment: DetectedRecurringPayment }) => {
    const ignored = isIgnored(payment.counterpartyPattern)
    return (
      <div
        className={cn(
          'p-4 rounded-lg border bg-card transition-all',
          ignored && 'opacity-40'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold">{payment.counterpartyName}</h3>
              <Badge variant={payment.frequency === 'Monthly' ? 'default' : 'secondary'}>
                {payment.frequency}
              </Badge>
              {ignored && (
                <Badge variant="outline" className="text-muted-foreground">
                  Ignored
                </Badge>
              )}
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="font-medium">Amount:</span> {formatCurrency(payment.averageAmount)}
              </p>
              <p>
                <span className="font-medium">Next Expected:</span>{' '}
                {formatDate(payment.nextExpectedDate)}
              </p>
              <p>
                <span className="font-medium">Transactions:</span> {payment.transactionCount} in last
                12 months
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleIgnore(payment.counterpartyPattern, ignored)}
            className="shrink-0"
          >
            {ignored ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Restore
              </>
            ) : (
              'Not Recurring'
            )}
          </Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
            <CardTitle className="text-base">Monthly Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
            <CardTitle className="text-base">Annual Commitments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <CardTitle className="text-base">Recurring Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={AlertCircle} title="Error loading data" description={error} />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Monthly Subscriptions */}
      <Card>
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Monthly Subscriptions
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Recurring monthly payments detected from your transaction history
          </p>
        </CardHeader>
        <CardContent>
          {monthlyPayments.length > 0 ? (
            <div className="space-y-3">
              {monthlyPayments.map((payment) => (
                <PaymentCard key={payment.counterpartyPattern} payment={payment} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No monthly subscriptions found"
              description="No recurring monthly payments detected in the last 12 months."
            />
          )}
        </CardContent>
      </Card>

      {/* Annual Commitments */}
      <Card>
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Annual Commitments
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Recurring annual payments detected from your transaction history
          </p>
        </CardHeader>
        <CardContent>
          {yearlyPayments.length > 0 ? (
            <div className="space-y-3">
              {yearlyPayments.map((payment) => (
                <PaymentCard key={payment.counterpartyPattern} payment={payment} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No annual commitments found"
              description="No recurring annual payments detected in the last 12 months."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
