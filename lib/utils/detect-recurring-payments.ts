import { TransactionLog } from '@/lib/types'

export interface DetectedRecurringPayment {
  counterpartyPattern: string
  counterpartyName: string
  frequency: 'Monthly' | 'Yearly'
  averageAmount: number
  nextExpectedDate: Date
  transactionCount: number
  lastTransactionDate: Date
}

const EXCLUDED_CATEGORIES = ['Excluded', 'Income', 'Gift Money', 'Other Income']

/** Monthly interval range (days). Slightly wider for month-length and processing delays. */
const MONTHLY_DAYS_MIN = 24
const MONTHLY_DAYS_MAX = 38
/** Calendar-based monthly: same day-of-month style (28-31 days). */
const CALENDAR_MONTHLY_DAYS_MIN = 28
const CALENDAR_MONTHLY_DAYS_MAX = 31
/** Yearly interval range (days). Covers leap years and renewal delays. */
const YEARLY_DAYS_MIN = 320
const YEARLY_DAYS_MAX = 410
/** Amount variance: 15% to allow subscription price increases. */
const AMOUNT_VARIANCE = 0.15

/**
 * Detects recurring payments from transaction log data.
 * Groups by counterparty_dedup when present, else counterparty (normalized to lowercase trim).
 * Identifies monthly (24-38 day intervals or calendar 28-31) and yearly (320-410 day) patterns.
 *
 * Data window: Last 30 months for pattern detection.
 * Live check: Monthly = last tx within 60 days; Yearly = last tx within 14 months.
 * Fallbacks: Monthly (2+ txs in 90d with monthly spacing); Yearly (2+ txs in 14 months with yearly spacing).
 */
export function detectRecurringPayments(
  transactions: TransactionLog[],
  currency: 'GBP' | 'USD',
  fxRate: number = 1
): DetectedRecurringPayment[] {
  // Filter to last 30 months (2.5 years) to detect annual recurring payments
  // Annual payments need at least 2 transactions to detect pattern, so we need to look back
  // at least 2 years. Using 30 months provides buffer for slightly irregular annual payments.
  const thirtyMonthsAgo = new Date()
  thirtyMonthsAgo.setMonth(thirtyMonthsAgo.getMonth() - 30)
  thirtyMonthsAgo.setHours(0, 0, 0, 0)

  const filteredTransactions = transactions.filter((tx) => {
    if (!tx.date) return false
    if (EXCLUDED_CATEGORIES.includes(tx.category || '')) return false

    const txDate = typeof tx.date === 'string' ? new Date(tx.date) : new Date(tx.date)
    txDate.setHours(0, 0, 0, 0)
    return txDate >= thirtyMonthsAgo
  })

  // Group by full normalized counterparty (counterparty_dedup when present for consistency with DB)
  const groupedTransactions = new Map<string, TransactionLog[]>()
  function getPattern(tx: TransactionLog): string {
    const raw = tx.counterparty_dedup ?? tx.counterparty ?? ''
    return raw.toString().toLowerCase().trim()
  }

  filteredTransactions.forEach((tx) => {
    const pattern = getPattern(tx)
    if (!pattern) return

    if (!groupedTransactions.has(pattern)) {
      groupedTransactions.set(pattern, [])
    }
    groupedTransactions.get(pattern)!.push(tx)
  })

  const recurringPayments: DetectedRecurringPayment[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sixtyDaysAgo = new Date(today)
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  sixtyDaysAgo.setHours(0, 0, 0, 0)

  const fourteenMonthsAgo = new Date(today)
  fourteenMonthsAgo.setMonth(fourteenMonthsAgo.getMonth() - 14)
  fourteenMonthsAgo.setHours(0, 0, 0, 0)

  const fourMonthsAgo = new Date(today)
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4)
  fourMonthsAgo.setHours(0, 0, 0, 0)

  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  ninetyDaysAgo.setHours(0, 0, 0, 0)

  groupedTransactions.forEach((txs, pattern) => {
    if (txs.length < 2) return // Need at least 2 transactions to detect a pattern

    // Sort by date
    const sortedTxs = [...txs].sort((a, b) => {
      const dateA = typeof a.date === 'string' ? new Date(a.date) : new Date(a.date)
      const dateB = typeof b.date === 'string' ? new Date(b.date) : new Date(b.date)
      return dateA.getTime() - dateB.getTime()
    })

    const lastTx = sortedTxs[sortedTxs.length - 1]
    const lastDate = typeof lastTx.date === 'string' ? new Date(lastTx.date) : new Date(lastTx.date)
    lastDate.setHours(0, 0, 0, 0)

    // Pre-check: require at least one recent transaction (14 months) so we can classify yearly
    if (lastDate < fourteenMonthsAgo) {
      return // No recent activity
    }

    // Get amounts in selected currency
    const amounts = sortedTxs.map((tx) => {
      if (currency === 'USD') {
        if (tx.amount_usd != null && tx.amount_usd < 0) {
          return Math.abs(tx.amount_usd)
        } else if (tx.amount_gbp != null && tx.amount_gbp < 0) {
          return Math.abs(tx.amount_gbp * fxRate)
        }
      } else {
        if (tx.amount_gbp != null && tx.amount_gbp < 0) {
          return Math.abs(tx.amount_gbp)
        } else if (tx.amount_usd != null && tx.amount_usd < 0) {
          return Math.abs(tx.amount_usd / fxRate)
        }
      }
      return 0
    }).filter(amt => amt > 0)

    if (amounts.length < 2) return

    // Calculate average amount
    const averageAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length

    // Amount variance: within 15% of average (allows subscription price increases)
    const amountVarianceOk = amounts.every((amt) => {
      const variance = Math.abs(amt - averageAmount) / averageAmount
      return variance <= AMOUNT_VARIANCE
    })

    if (!amountVarianceOk) return

    // Calculate intervals between transactions
    const intervals: number[] = []
    for (let i = 1; i < sortedTxs.length; i++) {
      const dateA = typeof sortedTxs[i - 1].date === 'string'
        ? new Date(sortedTxs[i - 1].date)
        : new Date(sortedTxs[i - 1].date)
      const dateB = typeof sortedTxs[i].date === 'string'
        ? new Date(sortedTxs[i].date)
        : new Date(sortedTxs[i].date)

      const daysDiff = Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24))
      intervals.push(daysDiff)
    }

    // Monthly: 24-38 days
    const monthlyIntervals = intervals.filter((days) => days >= MONTHLY_DAYS_MIN && days <= MONTHLY_DAYS_MAX)
    const monthlyAvgInterval = monthlyIntervals.length > 0
      ? monthlyIntervals.reduce((sum, days) => sum + days, 0) / monthlyIntervals.length
      : 0

    // Calendar-based monthly: 28-31 days (same day-of-month style)
    const calendarMonthlyIntervals = intervals.filter((days) => days >= CALENDAR_MONTHLY_DAYS_MIN && days <= CALENDAR_MONTHLY_DAYS_MAX)
    const calendarMonthlyAvgInterval = calendarMonthlyIntervals.length > 0
      ? calendarMonthlyIntervals.reduce((sum, days) => sum + days, 0) / calendarMonthlyIntervals.length
      : 0

    // Yearly: 320-410 days
    const yearlyIntervals = intervals.filter((days) => days >= YEARLY_DAYS_MIN && days <= YEARLY_DAYS_MAX)
    const yearlyAvgInterval = yearlyIntervals.length > 0
      ? yearlyIntervals.reduce((sum, days) => sum + days, 0) / yearlyIntervals.length
      : 0

    // 2. DENSITY CHECK: Count transactions in last 4 months
    const transactionsLast4Months = sortedTxs.filter((tx) => {
      const txDate = typeof tx.date === 'string' ? new Date(tx.date) : new Date(tx.date)
      txDate.setHours(0, 0, 0, 0)
      return txDate >= fourMonthsAgo
    }).length

    // Determine frequency
    let frequency: 'Monthly' | 'Yearly' | null = null
    let avgInterval = 0

    const strongMonthlyMatch = monthlyIntervals.length >= 2 && monthlyIntervals.length >= intervals.length * 0.5
    const strongYearlyMatch = yearlyIntervals.length >= 1 && yearlyIntervals.length >= intervals.length * 0.5

    // Monthly: 3+ txs, 2+ monthly intervals, 50% match; density: 2+ in last 4 months OR 1+ when strong match
    if (
      txs.length >= 3 &&
      strongMonthlyMatch &&
      (transactionsLast4Months >= 2 || (transactionsLast4Months >= 1 && monthlyIntervals.length >= intervals.length * 0.5))
    ) {
      frequency = 'Monthly'
      avgInterval = monthlyAvgInterval
    }
    // Calendar-based monthly: 2+ txs with 28-31 day intervals (same day-of-month)
    else if (
      txs.length >= 2 &&
      calendarMonthlyIntervals.length >= 1 &&
      calendarMonthlyIntervals.length >= intervals.length * 0.5 &&
      (transactionsLast4Months >= 2 || transactionsLast4Months >= 1)
    ) {
      frequency = 'Monthly'
      avgInterval = calendarMonthlyAvgInterval
    }
    // Monthly with 2 txs: one monthly interval, both in last 4 months
    else if (
      txs.length === 2 &&
      monthlyIntervals.length === 1 &&
      intervals.length === 1 &&
      (transactionsLast4Months >= 2 || transactionsLast4Months >= 1)
    ) {
      frequency = 'Monthly'
      avgInterval = monthlyAvgInterval
    }
    // Yearly: 2+ txs, at least 1 yearly interval, 50% yearly
    else if (txs.length >= 2 && strongYearlyMatch) {
      frequency = 'Yearly'
      avgInterval = yearlyAvgInterval
    }

    // Fallback monthly: 2+ txs in last 90 days with roughly monthly spacing
    if (!frequency) {
      const transactionsLast90Days = sortedTxs.filter((tx) => {
        const txDate = typeof tx.date === 'string' ? new Date(tx.date) : new Date(tx.date)
        txDate.setHours(0, 0, 0, 0)
        return txDate >= ninetyDaysAgo
      })

      if (transactionsLast90Days.length >= 2) {
        const recentIntervals: number[] = []
        for (let i = 1; i < transactionsLast90Days.length; i++) {
          const dateA = typeof transactionsLast90Days[i - 1].date === 'string'
            ? new Date(transactionsLast90Days[i - 1].date)
            : new Date(transactionsLast90Days[i - 1].date)
          const dateB = typeof transactionsLast90Days[i].date === 'string'
            ? new Date(transactionsLast90Days[i].date)
            : new Date(transactionsLast90Days[i].date)
          const daysDiff = Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24))
          recentIntervals.push(daysDiff)
        }
        const hasMonthlyInterval = recentIntervals.some((days) => days >= MONTHLY_DAYS_MIN && days <= MONTHLY_DAYS_MAX)
        if (hasMonthlyInterval) {
          const recentAvgInterval = recentIntervals.reduce((sum, days) => sum + days, 0) / recentIntervals.length
          if (recentAvgInterval >= MONTHLY_DAYS_MIN && recentAvgInterval <= MONTHLY_DAYS_MAX) {
            frequency = 'Monthly'
            avgInterval = recentAvgInterval
          }
        }
      }
    }

    // Fallback yearly: 2+ txs in last 14 months with roughly yearly spacing
    if (!frequency) {
      const transactionsLast14Months = sortedTxs.filter((tx) => {
        const txDate = typeof tx.date === 'string' ? new Date(tx.date) : new Date(tx.date)
        txDate.setHours(0, 0, 0, 0)
        return txDate >= fourteenMonthsAgo
      })

      if (transactionsLast14Months.length >= 2) {
        const recentIntervals: number[] = []
        for (let i = 1; i < transactionsLast14Months.length; i++) {
          const dateA = typeof transactionsLast14Months[i - 1].date === 'string'
            ? new Date(transactionsLast14Months[i - 1].date)
            : new Date(transactionsLast14Months[i - 1].date)
          const dateB = typeof transactionsLast14Months[i].date === 'string'
            ? new Date(transactionsLast14Months[i].date)
            : new Date(transactionsLast14Months[i].date)
          const daysDiff = Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24))
          recentIntervals.push(daysDiff)
        }
        const hasYearlyInterval = recentIntervals.some((days) => days >= YEARLY_DAYS_MIN && days <= YEARLY_DAYS_MAX)
        if (hasYearlyInterval) {
          const recentAvgInterval = recentIntervals.reduce((sum, days) => sum + days, 0) / recentIntervals.length
          if (recentAvgInterval >= YEARLY_DAYS_MIN && recentAvgInterval <= YEARLY_DAYS_MAX) {
            frequency = 'Yearly'
            avgInterval = recentAvgInterval
          }
        }
      }
    }

    if (!frequency) return

    // Frequency-specific live check: monthly 60 days, yearly 14 months
    if (frequency === 'Monthly' && lastDate < sixtyDaysAgo) return
    if (frequency === 'Yearly' && lastDate < fourteenMonthsAgo) return

    // Get the most common counterparty name (for display)
    const counterpartyCounts = new Map<string, number>()
    sortedTxs.forEach((tx) => {
      const name = tx.counterparty || ''
      counterpartyCounts.set(name, (counterpartyCounts.get(name) || 0) + 1)
    })
    const mostCommonCounterparty = Array.from(counterpartyCounts.entries())
      .sort((a, b) => b[1] - a[1])[0][0]

    // Calculate next expected date (already have lastDate from Live Check above)
    const nextExpectedDate = new Date(lastDate)
    nextExpectedDate.setDate(nextExpectedDate.getDate() + Math.round(avgInterval))

    recurringPayments.push({
      counterpartyPattern: pattern,
      counterpartyName: mostCommonCounterparty,
      frequency,
      averageAmount,
      nextExpectedDate,
      transactionCount: sortedTxs.length,
      lastTransactionDate: lastDate,
    })
  })

  // Sort by next expected date (soonest first)
  return recurringPayments.sort((a, b) => a.nextExpectedDate.getTime() - b.nextExpectedDate.getTime())
}
