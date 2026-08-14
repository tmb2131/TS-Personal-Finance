'use client'

import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { useRecurringTransactions, useRecurringPreferences } from '@/lib/hooks/queries/use-recurring'
import { TransactionLog, RecurringPreference } from '@/lib/types'
import { parseLocalDate } from '@/lib/date-utils'
import { useCurrency } from '@/lib/contexts/currency-context'
import { detectRecurringPayments, DetectedRecurringPayment } from '@/lib/utils/detect-recurring-payments'
import { AlertCircle, Calendar, FileText, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from 'sonner'

function getTransactionsForPattern(
  transactions: TransactionLog[],
  pattern: string
): TransactionLog[] {
  const normalizedPattern = pattern.toLowerCase()
  return transactions
    .filter((tx) => {
      const raw = tx.counterparty_dedup ?? tx.counterparty ?? ''
      const txPattern = raw.toString().toLowerCase().trim()
      return txPattern === normalizedPattern
    })
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })
}

export function RecurringPayments() {
  const queryClient = useQueryClient()
  const { currency, fxRate } = useCurrency()
  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useRecurringTransactions()
  const {
    data: preferencesData,
    isLoading: preferencesLoading,
    error: preferencesError,
  } = useRecurringPreferences()
  const transactions = transactionsData ?? []
  const preferences = (preferencesData ?? []) as RecurringPreference[]
  const loading = transactionsLoading || preferencesLoading
  const fetchErr = transactionsError ?? preferencesError
  const error = fetchErr
    ? fetchErr instanceof Error
      ? fetchErr.message
      : 'Failed to load recurring payments data'
    : null
  const [selectedPayment, setSelectedPayment] = useState<DetectedRecurringPayment | null>(null)
  const [editingNotesPayment, setEditingNotesPayment] = useState<DetectedRecurringPayment | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  // Detect recurring payments
  const detectedPayments = useMemo(() => {
    if (!transactions.length) return []
    return detectRecurringPayments(transactions, currency, fxRate)
  }, [transactions, currency, fxRate])

  // Match preference to payment pattern: exact or prefix so existing 5-char prefs still match full normalized pattern
  const patternMatchesPreference = (prefPattern: string, paymentPattern: string): boolean => {
    const a = prefPattern.toLowerCase()
    const b = paymentPattern.toLowerCase()
    return a === b || b.startsWith(a) || a.startsWith(b)
  }

  const isIgnored = (pattern: string): boolean => {
    return preferences.some(
      (p) => p.is_ignored && patternMatchesPreference(p.counterparty_pattern, pattern)
    )
  }

  // Find preference that matches this payment's pattern (prefer exact, then longest)
  const getPreferenceForPayment = (payment: DetectedRecurringPayment): RecurringPreference | undefined => {
    const pattern = payment.counterpartyPattern.toLowerCase()
    const matching = preferences.filter((p) => patternMatchesPreference(p.counterparty_pattern, pattern))
    if (matching.length === 0) return undefined
    if (matching.length === 1) return matching[0]
    const exact = matching.find((p) => p.counterparty_pattern.toLowerCase() === pattern)
    if (exact) return exact
    matching.sort((a, b) => b.counterparty_pattern.length - a.counterparty_pattern.length)
    return matching[0]
  }

  const saveNote = async (payment: DetectedRecurringPayment, notes: string) => {
    const supabase = createClient()
    const normalizedPattern = payment.counterpartyPattern.toLowerCase()
    const trimmed = notes.trim() || null

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('You must be signed in to add notes')
        return
      }

      const existing = getPreferenceForPayment(payment)

      if (existing) {
        const { error } = await supabase
          .from('recurring_preferences')
          .update({ notes: trimmed })
          .eq('id', existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('recurring_preferences')
          .insert({
            user_id: user.id,
            counterparty_pattern: normalizedPattern,
            is_ignored: false,
            notes: trimmed,
          })

        if (error) throw error
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.recurringPreferences })
      setEditingNotesPayment(null)
      setNotesDraft('')
      toast.success(trimmed ? 'Note saved' : 'Note cleared')
    } catch (err) {
      console.error('Error saving note:', err)
      toast.error('Failed to save note')
    }
  }

  // Filter out ignored payments and separate by frequency
  const { monthlyPayments, yearlyPayments } = useMemo(() => {
    const active = detectedPayments.filter(
      (payment) => !preferences.some((p) => p.is_ignored && patternMatchesPreference(p.counterparty_pattern, payment.counterpartyPattern))
    )
    const ignored = detectedPayments.filter(
      (payment) => preferences.some((p) => p.is_ignored && patternMatchesPreference(p.counterparty_pattern, payment.counterpartyPattern))
    )

    const activeMonthly = active.filter((p) => p.frequency === 'Monthly')
    const activeYearly = active.filter((p) => p.frequency === 'Yearly')
    const ignoredMonthly = ignored.filter((p) => p.frequency === 'Monthly')
    const ignoredYearly = ignored.filter((p) => p.frequency === 'Yearly')

    const byAmountDesc = (a: { averageAmount: number }, b: { averageAmount: number }) =>
      b.averageAmount - a.averageAmount

    return {
      monthlyPayments: [...activeMonthly.sort(byAmountDesc), ...ignoredMonthly.sort(byAmountDesc)],
      yearlyPayments: [...activeYearly.sort(byAmountDesc), ...ignoredYearly.sort(byAmountDesc)],
    }
  }, [detectedPayments, preferences])

  // Calculate totals for summaries
  const { monthlyTotal, yearlyTotal } = useMemo(() => {
    const monthlySum = monthlyPayments
      .filter(p => !isIgnored(p.counterpartyPattern))
      .reduce((sum, payment) => sum + (payment.averageAmount * 12), 0) // Convert to annualized
    const yearlySum = yearlyPayments
      .filter(p => !isIgnored(p.counterpartyPattern))
      .reduce((sum, payment) => sum + payment.averageAmount, 0)

    return {
      monthlyTotal: monthlySum,
      yearlyTotal: yearlySum,
    }
  }, [monthlyPayments, yearlyPayments])

  
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

  const isUpcoming = (nextExpectedDate: Date): boolean => {
    const today = new Date()
    const daysUntil = Math.ceil((nextExpectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntil >= 0 && daysUntil <= 7
  }
  
  const toggleIgnore = async (pattern: string, currentlyIgnored: boolean) => {
    const supabase = createClient()
    const normalizedPattern = pattern.toLowerCase()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('You must be signed in to update preferences')
        return
      }

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
        // Create new preference (user_id required for RLS and NOT NULL)
        const { error } = await supabase
          .from('recurring_preferences')
          .insert({
            user_id: user.id,
            counterparty_pattern: normalizedPattern,
            is_ignored: !currentlyIgnored,
          })

        if (error) throw error
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.recurringPreferences })

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

  const PaymentCard = ({ payment }: { payment: DetectedRecurringPayment }) => {
    const ignored = isIgnored(payment.counterpartyPattern)
    const upcoming = isUpcoming(payment.nextExpectedDate)
    const preference = getPreferenceForPayment(payment)
    const note = preference?.notes?.trim()

    return (
      <div
        className={cn(
          'p-4 rounded-lg border bg-card transition-all',
          ignored && 'opacity-40',
          upcoming && !ignored && 'border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-muted'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedPayment(payment)}
                className="font-semibold text-left hover:underline underline-offset-2 focus:outline-none focus:underline"
              >
                {payment.counterpartyName}
              </button>
              <Badge variant={payment.frequency === 'Monthly' ? 'default' : 'secondary'}>
                {payment.frequency}
              </Badge>
              {upcoming && !ignored && (
                <Badge variant="outline" className="text-muted-foreground dark:text-muted-foreground border-orange-300 dark:border-orange-700">
                  Upcoming
                </Badge>
              )}
              {ignored && (
                <Badge variant="outline" className="text-muted-foreground">
                  Ignored
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEditingNotesPayment(payment)
                  setNotesDraft(preference?.notes ?? '')
                }}
                title={note ? 'Edit note' : 'Add note'}
              >
                <FileText className={cn('h-4 w-4', note && 'text-foreground')} />
              </Button>
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
              {note && (
                <p className="pt-1 border-t border-border/50 mt-1">
                  <span className="font-medium">Note:</span> {note}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleIgnore(payment.counterpartyPattern, ignored)}
            className={cn(
              'shrink-0',
              ignored && 'text-muted-foreground hover:text-destructive'
            )}
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
          {monthlyTotal > 0 && (
            <p className="text-sm font-medium text-foreground">
              Total annualized: {formatCurrency(monthlyTotal)}
            </p>
          )}
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
              description="No recurring monthly payments detected in your transaction history."
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
          {yearlyTotal > 0 && (
            <p className="text-sm font-medium text-foreground">
              Total annual: {formatCurrency(yearlyTotal)}
            </p>
          )}
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
              description="No recurring annual payments detected in your transaction history (analyzing last 30 months)."
            />
          )}
        </CardContent>
      </Card>

      {/* Transaction details dialog */}
      <Dialog
        open={!!selectedPayment}
        onOpenChange={(open) => !open && setSelectedPayment(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedPayment ? selectedPayment.counterpartyName : ''} — transactions
            </DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="flex-1 min-h-0 overflow-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getTransactionsForPattern(transactions, selectedPayment.counterpartyPattern).map(
                    (tx) => {
                      const amount =
                        currency === 'USD'
                          ? (tx.amount_usd != null
                              ? tx.amount_usd
                              : tx.amount_gbp != null
                                ? tx.amount_gbp * fxRate
                                : 0)
                          : (tx.amount_gbp != null
                              ? tx.amount_gbp
                              : tx.amount_usd != null
                                ? tx.amount_usd / fxRate
                                : 0)
                      return (
                        <TableRow key={tx.id}>
                          <TableCell>{formatDate(parseLocalDate(tx.date))}</TableCell>
                          <TableCell>{tx.counterparty ?? '—'}</TableCell>
                          <TableCell
                            className={cn(
                              'text-right',
                              amount < 0 && 'text-destructive'
                            )}
                          >
                            {formatCurrency(Math.abs(amount))}
                            {amount < 0 ? '' : ' (credit)'}
                          </TableCell>
                          <TableCell>{tx.category ?? '—'}</TableCell>
                        </TableRow>
                      )
                    }
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Note edit dialog for detected recurring payments */}
      <Dialog
        open={!!editingNotesPayment}
        onOpenChange={(open) => {
          if (!open) {
            setEditingNotesPayment(null)
            setNotesDraft('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Note — {editingNotesPayment?.counterpartyName ?? ''}
            </DialogTitle>
          </DialogHeader>
          {editingNotesPayment && (
            <div className="space-y-4 mt-2">
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                placeholder="e.g. renewal date, account reference"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingNotesPayment(null)
                    setNotesDraft('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => saveNote(editingNotesPayment, notesDraft)}
                >
                  Save note
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
