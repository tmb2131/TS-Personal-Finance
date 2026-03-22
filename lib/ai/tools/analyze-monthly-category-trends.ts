import { z } from 'zod'
import type { ToolContext } from './types'
import { fetchCurrentFxRateForTool } from './helpers'

export function createAnalyzeMonthlyCategoryTrendsTool(ctx: ToolContext) {
  return {
    description: `Analyze monthly spending trends for a specific category over the last 13 months. Use this for questions about:
        - Monthly spending patterns for a category (e.g., "How has my Bills spending changed month by month?")
        - Category comparisons vs historical averages (L3M, L12M, year-ago)
        - Top counterparties/merchants driving category spending
        - Monthly trend analysis and insights
        Returns monthly breakdowns, comparisons to averages, and identifies the top transaction counterparty.`,
    inputSchema: z.object({
      category: z.string().describe('Category to analyze (e.g., "Bills", "Food", "Transport")'),
      currency: z.enum(['GBP', 'USD']).optional().default('GBP').describe('Currency for display. Data is stored in both GBP and USD.'),
    }),
    execute: async ({ category, currency = 'GBP' }: { category: string; currency?: 'GBP' | 'USD' }) => {
      try {
        console.log('[chat] analyze_monthly_category_trends: Starting', { category, currency })

        const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']
        if (EXCLUDED_CATEGORIES.includes(category)) {
          return { error: `Category "${category}" is excluded from trend analysis. Please use an expense category.` }
        }

        const today = new Date()
        const lastFullMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const endDate = new Date(today.getFullYear(), today.getMonth(), 0)
        endDate.setHours(23, 59, 59, 999)
        const startDate = new Date(lastFullMonth.getFullYear(), lastFullMonth.getMonth() - 12, 1)
        startDate.setHours(0, 0, 0, 0)

        const formatDateStr = (date: Date): string => {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }

        const startDateStr = formatDateStr(startDate)
        const endDateStr = formatDateStr(endDate)

        let allTransactions: any[] = []
        let page = 0
        const pageSize = 1000
        let hasMore = true

        while (hasMore) {
          const from = page * pageSize
          const to = from + pageSize - 1

          const transactionsResult = await ctx.supabase
            .from('transaction_log')
            .select('*', { count: 'exact' })
            .eq('user_id', ctx.userId)
            .eq('category', category)
            .gte('date', startDateStr)
            .lte('date', endDateStr)
            .order('date', { ascending: true })
            .range(from, to)

          if (transactionsResult.error) {
            console.error('[chat] analyze_monthly_category_trends: Query error', transactionsResult.error)
            return { error: transactionsResult.error.message }
          }

          const pageTransactions = transactionsResult.data || []
          allTransactions = [...allTransactions, ...pageTransactions]

          hasMore = pageTransactions.length === pageSize
          page++
        }

        if (allTransactions.length === 0) {
          return {
            trends: null,
            summary: `No transactions found for category "${category}" in the last 13 months.`,
          }
        }

        const { data: fxRates } = await ctx.supabase
          .from('fx_rates')
          .select('date, gbpusd_rate')
          .lte('date', endDateStr)
          .order('date', { ascending: false })
          .limit(500)

        const ratesByDate = new Map<string, number>()
        fxRates?.forEach((rate: { date: string; gbpusd_rate: number | null }) => {
          if (rate.gbpusd_rate) {
            ratesByDate.set(rate.date, rate.gbpusd_rate)
          }
        })

        const currentFxRate = await fetchCurrentFxRateForTool(ctx.supabase)

        const getRateForDate = (dateStr: string): number => {
          const dateKey = dateStr.split('T')[0]
          return ratesByDate.get(dateKey) || currentFxRate
        }

        const allMonths: string[] = []
        const currentMonth = new Date(startDate)
        for (let i = 0; i < 13; i++) {
          const year = currentMonth.getFullYear()
          const month = currentMonth.getMonth() + 1
          const monthKey = `${year}-${String(month).padStart(2, '0')}`
          allMonths.push(monthKey)
          currentMonth.setMonth(currentMonth.getMonth() + 1)
        }

        const monthlyGroups = new Map<string, any[]>()
        const allCounterpartyTotals = new Map<string, { total: number; fullName: string }>()

        allTransactions.forEach((tx) => {
          if (!tx.date) return

          const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
          const [yearStr, monthStr] = dateStr.split('-')

          if (!yearStr || !monthStr) return

          const year = parseInt(yearStr, 10)
          const month = parseInt(monthStr, 10)

          if (isNaN(year) || isNaN(month)) return

          const monthKey = `${year}-${String(month).padStart(2, '0')}`

          if (!monthlyGroups.has(monthKey)) {
            monthlyGroups.set(monthKey, [])
          }
          monthlyGroups.get(monthKey)!.push(tx)

          const rate = getRateForDate(dateStr)
          const amount = currency === 'USD'
            ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
            : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))

          if (amount < 0) {
            const absAmount = Math.abs(amount)
            const counterparty = tx.counterparty || 'Unknown'
            const counterpartyKey = counterparty.substring(0, 7).trim()

            if (allCounterpartyTotals.has(counterpartyKey)) {
              const existing = allCounterpartyTotals.get(counterpartyKey)!
              existing.total += absAmount
              if (counterparty.length > existing.fullName.length) {
                existing.fullName = counterparty
              }
            } else {
              allCounterpartyTotals.set(counterpartyKey, {
                total: absAmount,
                fullName: counterparty,
              })
            }
          }
        })

        let topCounterpartyKey = ''
        let topCounterpartyFullName = ''
        let topTotalAmount = 0

        allCounterpartyTotals.forEach((data, key) => {
          if (data.total > topTotalAmount) {
            topTotalAmount = data.total
            topCounterpartyKey = key
            topCounterpartyFullName = data.fullName
          }
        })

        const monthlyData: Array<{
          month: string
          monthLabel: string
          total: number
          topTransactionAmount: number
          otherAmount: number
        }> = []

        allMonths.forEach((monthKey) => {
          const monthTransactions = monthlyGroups.get(monthKey) || []

          let topTransactionAmount = 0
          let totalAmount = 0

          monthTransactions.forEach((tx) => {
            const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
            const rate = getRateForDate(dateStr)
            const amount = currency === 'USD'
              ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
              : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))

            if (amount < 0) {
              const absAmount = Math.abs(amount)
              totalAmount += absAmount

              const counterparty = tx.counterparty || 'Unknown'
              const counterpartyKey = counterparty.substring(0, 7).trim()

              if (counterpartyKey === topCounterpartyKey) {
                topTransactionAmount += absAmount
              }
            }
          })

          const [yr, mo] = monthKey.split('-')
          const monthLabel = `${yr}-${parseInt(mo)}`

          monthlyData.push({
            month: monthKey,
            monthLabel,
            total: totalAmount,
            topTransactionAmount,
            otherAmount: totalAmount - topTransactionAmount,
          })
        })

        const mostRecentMonth = monthlyData[monthlyData.length - 1]
        const currentMonthIndex = monthlyData.length - 1

        let l3mSum = 0
        let l3mCount = 0
        let l12mSum = 0
        let l12mCount = 0

        for (let i = Math.max(0, currentMonthIndex - 3); i < currentMonthIndex; i++) {
          if (monthlyData[i].total > 0) {
            l3mSum += monthlyData[i].total
            l3mCount++
          }
        }

        for (let i = 0; i < currentMonthIndex; i++) {
          if (monthlyData[i].total > 0) {
            l12mSum += monthlyData[i].total
            l12mCount++
          }
        }

        const l3mAvg = l3mCount > 0 ? l3mSum / l3mCount : null
        const l12mAvg = l12mCount > 0 ? l12mSum / l12mCount : null

        const [yr, mo] = mostRecentMonth.month.split('-')
        const lastYearMonth = `${parseInt(yr) - 1}-${mo}`
        const lyData = monthlyData.find(d => d.month === lastYearMonth)

        const vsL3M = l3mAvg !== null ? mostRecentMonth.total - l3mAvg : null
        const vsL12M = l12mAvg !== null ? mostRecentMonth.total - l12mAvg : null
        const vsLY = lyData ? mostRecentMonth.total - lyData.total : null

        const vsL3MPct = l3mAvg !== null && l3mAvg !== 0
          ? ((mostRecentMonth.total - l3mAvg) / l3mAvg) * 100
          : null
        const vsL12MPct = l12mAvg !== null && l12mAvg !== 0
          ? ((mostRecentMonth.total - l12mAvg) / l12mAvg) * 100
          : null
        const vsLYPct = lyData && lyData.total !== 0
          ? ((mostRecentMonth.total - lyData.total) / lyData.total) * 100
          : null

        const symbol = currency === 'USD' ? '$' : '£'
        const formatAmount = (amount: number) =>
          `${symbol}${Math.round(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

        const formatPercent = (pct: number | null) => {
          if (pct === null) return 'N/A'
          const sign = pct >= 0 ? '+' : ''
          return `${sign}${Math.round(pct)}%`
        }

        const monthLabel = mostRecentMonth.monthLabel
        const summaryParts: string[] = []

        summaryParts.push(`${category} spending in ${monthLabel}: ${formatAmount(mostRecentMonth.total)}`)

        if (topCounterpartyFullName) {
          summaryParts.push(`Top counterparty: ${topCounterpartyFullName} (${formatAmount(mostRecentMonth.topTransactionAmount)})`)
        }

        const comparisons: string[] = []
        if (vsL3M !== null) {
          const direction = vsL3M < 0 ? 'below' : 'above'
          comparisons.push(`${formatPercent(vsL3MPct)} ${direction} 3-month average`)
        }
        if (vsL12M !== null) {
          const direction = vsL12M < 0 ? 'below' : 'above'
          comparisons.push(`${formatPercent(vsL12MPct)} ${direction} 12-month average`)
        }
        if (vsLY !== null) {
          const direction = vsLY < 0 ? 'below' : 'above'
          comparisons.push(`${formatPercent(vsLYPct)} ${direction} same period last year`)
        }

        if (comparisons.length > 0) {
          summaryParts.push(`Comparisons: ${comparisons.join(', ')}`)
        }

        return {
          trends: {
            category,
            period: {
              startMonth: monthlyData[0].monthLabel,
              endMonth: mostRecentMonth.monthLabel,
              monthsAnalyzed: monthlyData.length,
            },
            currentMonth: {
              month: mostRecentMonth.monthLabel,
              total: mostRecentMonth.total,
              topTransaction: {
                counterparty: topCounterpartyFullName,
                amount: mostRecentMonth.topTransactionAmount,
              },
              otherAmount: mostRecentMonth.otherAmount,
            },
            comparisons: {
              vsL3M: vsL3M !== null ? { amount: vsL3M, percentage: vsL3MPct } : null,
              vsL12M: vsL12M !== null ? { amount: vsL12M, percentage: vsL12MPct } : null,
              vsLY: vsLY !== null ? { amount: vsLY, percentage: vsLYPct } : null,
            },
            monthlyBreakdown: monthlyData.map(d => ({
              month: d.monthLabel,
              total: d.total,
              topTransactionAmount: d.topTransactionAmount,
              otherAmount: d.otherAmount,
            })),
          },
          summary: summaryParts.join('. '),
        }
      } catch (err) {
        console.error('[chat] analyze_monthly_category_trends: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
