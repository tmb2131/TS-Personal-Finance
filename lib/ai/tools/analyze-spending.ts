import { z } from 'zod'
import type { ToolContext } from './types'
import { fetchCurrentFxRateForTool } from './helpers'

export function createAnalyzeSpendingTool(ctx: ToolContext) {
  return {
    description: `Analyze spending, income, and transactions. Use this for questions about:
        - Spending by category, merchant, or time period
        - Income vs expenses
        - Specific merchant spending (e.g., "Uber", "Amazon")
        - Spending trends over date ranges
        For relative dates ("last month", "this year") use the exact startDate and endDate (YYYY-MM-DD) from the system message's CURRENT DATE CONTEXT. Do not guess. Automatically excludes 'Excluded', 'Income', 'Gift Money', and 'Other Income' categories unless explicitly requested.`,
    inputSchema: z.object({
      startDate: z.string().optional().describe('Start date for analysis (YYYY-MM-DD). For "last month" use the range from CURRENT DATE CONTEXT. Defaults to start of current year if not specified.'),
      endDate: z.string().optional().describe('End date for analysis (YYYY-MM-DD). For "last month" use the range from CURRENT DATE CONTEXT. Defaults to today if not specified.'),
      merchant: z.string().optional().describe('Search for specific merchant/counterparty (fuzzy search, case-insensitive)'),
      category: z.string().optional().describe('Filter by specific category'),
      transactionType: z.enum(['expenses', 'income', 'all']).optional().default('expenses').describe('Filter by transaction type: expenses (negative amounts), income (positive amounts), or all'),
      includeExcluded: z.boolean().optional().default(false).describe('Include excluded categories (Excluded, Income, Gift Money, Other Income). Default is false.'),
      groupBy: z.enum(['category', 'merchant', 'month']).optional().describe('Group results by category, merchant, or month'),
      limit: z.number().optional().default(100).describe('Maximum number of transactions to return (for detailed lists)'),
    }),
    execute: async ({
      startDate,
      endDate,
      merchant,
      category,
      transactionType = 'expenses',
      includeExcluded = false,
      groupBy,
      limit = 100,
    }: {
      startDate?: string
      endDate?: string
      merchant?: string
      category?: string
      transactionType?: 'expenses' | 'income' | 'all'
      includeExcluded?: boolean
      groupBy?: 'category' | 'merchant' | 'month'
      limit?: number
    }) => {
      try {
        console.log('[chat] analyze_spending: Starting execution', {
          startDate, endDate, merchant, category, transactionType, includeExcluded, groupBy,
        })

        const EXCLUDED_CATEGORIES = ['Excluded', 'Income', 'Gift Money', 'Other Income']

        const today = new Date()
        const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), 0, 1)
        const end = endDate ? new Date(endDate) : today

        start.setHours(0, 0, 0, 0)
        end.setHours(23, 59, 59, 999)

        const queryLimit = 10000
        let queryBuilder = ctx.supabase
          .from('transaction_log')
          .select('*')
          .eq('user_id', ctx.userId)
          .gte('date', start.toISOString().split('T')[0])
          .lte('date', end.toISOString().split('T')[0])
          .order('date', { ascending: false })
          .limit(queryLimit)

        if (category) {
          queryBuilder = queryBuilder.eq('category', category)
        }

        if (merchant) {
          queryBuilder = queryBuilder.ilike('counterparty', `%${merchant}%`)
        }

        const { data: transactions, error } = await queryBuilder

        if (error) {
          console.error('[chat] analyze_spending: Query error', error)
          return { error: error.message }
        }

        if (!transactions || transactions.length === 0) {
          return {
            analysis: null,
            summary: 'No transactions found for the specified criteria.',
          }
        }

        let filtered = transactions.filter((tx) => {
          if (!includeExcluded && EXCLUDED_CATEGORIES.includes(tx.category || '')) {
            return false
          }
          if (transactionType === 'expenses') {
            return (tx.amount_gbp && tx.amount_gbp < 0) || (tx.amount_usd && tx.amount_usd < 0)
          } else if (transactionType === 'income') {
            return (tx.amount_gbp && tx.amount_gbp > 0) || (tx.amount_usd && tx.amount_usd > 0)
          }
          return true
        })

        const fxRate = await fetchCurrentFxRateForTool(ctx.supabase)

        const convertToGBP = (amountUsd: number | null, amountGbp: number | null): number => {
          if (amountGbp !== null) return Math.abs(amountGbp)
          if (amountUsd !== null) return Math.abs(amountUsd) / fxRate
          return 0
        }

        let grouped: any = {}
        let totalGBP = 0
        let totalUSD = 0

        filtered.forEach((tx) => {
          const gbpAmount = convertToGBP(tx.amount_usd, tx.amount_gbp)
          const usdAmount = tx.amount_usd ? Math.abs(tx.amount_usd) : (tx.amount_gbp ? Math.abs(tx.amount_gbp) * fxRate : 0)

          totalGBP += gbpAmount
          totalUSD += usdAmount

          if (groupBy === 'category') {
            const cat = tx.category || 'Unknown'
            if (!grouped[cat]) {
              grouped[cat] = { category: cat, totalGBP: 0, totalUSD: 0, count: 0 }
            }
            grouped[cat].totalGBP += gbpAmount
            grouped[cat].totalUSD += usdAmount
            grouped[cat].count += 1
          } else if (groupBy === 'merchant') {
            const merch = tx.counterparty || 'Unknown'
            if (!grouped[merch]) {
              grouped[merch] = { merchant: merch, totalGBP: 0, totalUSD: 0, count: 0 }
            }
            grouped[merch].totalGBP += gbpAmount
            grouped[merch].totalUSD += usdAmount
            grouped[merch].count += 1
          } else if (groupBy === 'month') {
            const date = new Date(tx.date)
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            if (!grouped[monthKey]) {
              grouped[monthKey] = { month: monthKey, totalGBP: 0, totalUSD: 0, count: 0 }
            }
            grouped[monthKey].totalGBP += gbpAmount
            grouped[monthKey].totalUSD += usdAmount
            grouped[monthKey].count += 1
          }
        })

        const summary = transactionType === 'expenses'
          ? `Total spending: £${totalGBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP / $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (${filtered.length} transactions)`
          : transactionType === 'income'
          ? `Total income: £${totalGBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP / $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (${filtered.length} transactions)`
          : `Total: £${totalGBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP / $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (${filtered.length} transactions)`

        return {
          analysis: {
            period: {
              start: start.toISOString().split('T')[0],
              end: end.toISOString().split('T')[0],
            },
            totals: {
              gbp: totalGBP,
              usd: totalUSD,
              transactionCount: filtered.length,
            },
            grouped: groupBy ? Object.values(grouped).sort((a: any, b: any) => b.totalGBP - a.totalGBP) : null,
            transactions: !groupBy ? filtered.slice(0, limit).map(tx => ({
              date: tx.date,
              category: tx.category,
              counterparty: tx.counterparty || 'Unknown',
              amount_gbp: tx.amount_gbp,
              amount_usd: tx.amount_usd,
            })) : null,
          },
          summary,
        }
      } catch (err) {
        console.error('[chat] analyze_spending: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
