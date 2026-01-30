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

/**
 * Detects recurring payments from transaction log data
 * Groups by first 5 letters of counterparty (normalized to lowercase)
 * Identifies monthly (25-37 day intervals) and yearly (365 day intervals) patterns
 * 
 * Filtering rules:
 * 1. Live Check: Only includes series with transactions in the last 60 days
 * 2. Monthly Density Check: Monthly patterns must have 2+ transactions in last 4 months
 * 3. Amount Variance: Amounts must be within 10% of average
 * 4. Pattern Matching: At least 50% of intervals must match the pattern
 * 5. Fallback Detection: If 2+ transactions in last 90 days with monthly spacing, flag as monthly
 * 6. Only returns items that pass checks, sorted by Next Expected Date
 */
export function detectRecurringPayments(
  transactions: TransactionLog[],
  currency: 'GBP' | 'USD',
  fxRate: number = 1
): DetectedRecurringPayment[] {
  // Filter to last 12 months and exclude income categories
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  twelveMonthsAgo.setHours(0, 0, 0, 0)

  const filteredTransactions = transactions.filter((tx) => {
    if (!tx.date) return false
    if (EXCLUDED_CATEGORIES.includes(tx.category || '')) return false

    const txDate = typeof tx.date === 'string' ? new Date(tx.date) : new Date(tx.date)
    txDate.setHours(0, 0, 0, 0)
    return txDate >= twelveMonthsAgo
  })

  // Group by first 5 letters of counterparty (normalized to lowercase)
  const groupedTransactions = new Map<string, TransactionLog[]>()

  filteredTransactions.forEach((tx) => {
    if (!tx.counterparty) return

    const normalized = tx.counterparty.toLowerCase().trim()
    const pattern = normalized.substring(0, 5)

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

    // 1. LIVE CHECK: Filter out series where most recent transaction is older than 60 days
    const lastTx = sortedTxs[sortedTxs.length - 1]
    const lastDate = typeof lastTx.date === 'string' ? new Date(lastTx.date) : new Date(lastTx.date)
    lastDate.setHours(0, 0, 0, 0)

    if (lastDate < sixtyDaysAgo) {
      return // Skip inactive/cancelled subscriptions
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

    // Check if amounts are within 10% of each other (for 2+ transactions)
    const amountVariance = amounts.every((amt) => {
      const variance = Math.abs(amt - averageAmount) / averageAmount
      return variance <= 0.10
    })

    if (!amountVariance) return

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

    // Detect monthly pattern (25-37 days)
    const monthlyIntervals = intervals.filter((days) => days >= 25 && days <= 37)
    const monthlyAvgInterval = monthlyIntervals.length > 0
      ? monthlyIntervals.reduce((sum, days) => sum + days, 0) / monthlyIntervals.length
      : 0

    // Detect yearly pattern (330-400 days to account for slight variations)
    const yearlyIntervals = intervals.filter((days) => days >= 330 && days <= 400)
    const yearlyAvgInterval = yearlyIntervals.length > 0
      ? yearlyIntervals.reduce((sum, days) => sum + days, 0) / yearlyIntervals.length
      : 0

    // 2. DENSITY CHECK: Count transactions in last 4 months and last 12 months
    const transactionsLast4Months = sortedTxs.filter((tx) => {
      const txDate = typeof tx.date === 'string' ? new Date(tx.date) : new Date(tx.date)
      txDate.setHours(0, 0, 0, 0)
      return txDate >= fourMonthsAgo
    }).length

    const transactionsLast12Months = sortedTxs.length // Already filtered to last 12 months

    // Determine frequency
    let frequency: 'Monthly' | 'Yearly' | null = null
    let avgInterval = 0

    // Monthly: need 3+ transactions with 2+ monthly intervals, and at least 50% of intervals are monthly
    // PLUS density check: at least 2 in last 4 months
    if (
      txs.length >= 3 &&
      monthlyIntervals.length >= 2 &&
      monthlyIntervals.length >= intervals.length * 0.5 &&
      transactionsLast4Months >= 2
    ) {
      frequency = 'Monthly'
      avgInterval = monthlyAvgInterval
    } 
    // Yearly: can work with 2+ transactions, need at least 1 yearly interval, and at least 50% of intervals are yearly
    else if (txs.length >= 2 && yearlyIntervals.length >= 1 && yearlyIntervals.length >= intervals.length * 0.5) {
      frequency = 'Yearly'
      avgInterval = yearlyAvgInterval
    }
    // Also check for monthly with 2 transactions if both intervals are monthly
    // BUT still require density check
    else if (
      txs.length === 2 &&
      monthlyIntervals.length === 1 &&
      intervals.length === 1 &&
      transactionsLast4Months >= 2
    ) {
      frequency = 'Monthly'
      avgInterval = monthlyAvgInterval
    }

    // 5. FALLBACK DETECTION: If no frequency detected yet, check for 2+ transactions in last 90 days
    // with similar amounts and roughly monthly spacing
    if (!frequency) {
      const transactionsLast90Days = sortedTxs.filter((tx) => {
        const txDate = typeof tx.date === 'string' ? new Date(tx.date) : new Date(tx.date)
        txDate.setHours(0, 0, 0, 0)
        return txDate >= ninetyDaysAgo
      })

      if (transactionsLast90Days.length >= 2) {
        // Check if intervals between these recent transactions are roughly monthly (25-37 days)
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

        // Check if at least one interval is roughly monthly
        const hasMonthlyInterval = recentIntervals.some((days) => days >= 25 && days <= 37)

        if (hasMonthlyInterval) {
          // Calculate average interval from recent transactions
          const recentAvgInterval = recentIntervals.reduce((sum, days) => sum + days, 0) / recentIntervals.length
          
          // Only use fallback if the average interval is roughly monthly
          if (recentAvgInterval >= 25 && recentAvgInterval <= 37) {
            frequency = 'Monthly'
            avgInterval = recentAvgInterval
          }
        }
      }
    }

    if (!frequency) return

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
