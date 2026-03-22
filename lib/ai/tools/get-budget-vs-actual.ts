import { z } from 'zod'
import type { ToolContext } from './types'
import { fetchCurrentFxRateForTool } from './helpers'
import { computeAnnualForecasts } from '@/lib/forecasting'

export function createGetBudgetVsActualTool(ctx: ToolContext) {
  return {
    description: `Compare budget targets vs actual spending (YTD) or forecasted annual spend (annual). Use this for questions about:
        - "Am I over budget?"
        - Budget variance by category
        - Categories with biggest overspend
        - Budget performance for specific categories or time periods
        Note: For annual period, compares annual budget vs forecasted annual spend (tracking_est), not actual YTD spending.`,
    inputSchema: z.object({
      category: z.string().optional().describe('Filter by specific category. Omit to analyze all categories.'),
      year: z.number().optional().describe('Year for budget comparison. Defaults to current year.'),
      period: z.enum(['ytd', 'annual']).optional().default('ytd').describe('Compare YTD (year-to-date) uses actual transactions; annual uses forecasted annual spend (tracking_est) vs annual budget'),
    }),
    execute: async ({ category, year, period = 'ytd' }: { category?: string; year?: number; period?: 'ytd' | 'annual' }) => {
      try {
        console.log('[chat] get_budget_vs_actual: Starting execution', { category, year, period })

        const currentYear = year || new Date().getFullYear()
        const today = new Date()
        const startOfYear = new Date(currentYear, 0, 1)
        const endDate = period === 'ytd' ? today : new Date(currentYear, 11, 31, 23, 59, 59)

        let budgetQuery = ctx.supabase
          .from('budget_targets')
          .select('*')
          .eq('user_id', ctx.userId)

        if (category) {
          budgetQuery = budgetQuery.eq('category', category)
        }

        const { data: budgets, error: budgetError } = await budgetQuery

        if (budgetError) {
          console.error('[chat] get_budget_vs_actual: Budget query error', budgetError)
          return { error: budgetError.message }
        }

        if (!budgets || budgets.length === 0) {
          return {
            comparison: null,
            summary: category
              ? `No budget target found for category: ${category}`
              : 'No budget targets found.',
          }
        }

        const fxRate = await fetchCurrentFxRateForTool(ctx.supabase)
        const forecasts = await computeAnnualForecasts(ctx.supabase, ctx.userId)

        const EXCLUDED_CATEGORIES = ['Excluded', 'Income', 'Gift Money', 'Other Income']

        let actualByCategory: Record<string, { gbp: number; usd: number }> = {}

        if (period === 'annual') {
          budgets.forEach((budget) => {
            if (!EXCLUDED_CATEGORIES.includes(budget.category)) {
              const trackingGbp = Math.abs(forecasts.get(budget.category)?.forecast ?? budget.annual_budget_gbp ?? 0)
              const trackingUsd = trackingGbp * fxRate
              actualByCategory[budget.category] = { gbp: trackingGbp, usd: trackingUsd }
            }
          })
        } else {
          let transactionQuery = ctx.supabase
            .from('transaction_log')
            .select('*')
            .eq('user_id', ctx.userId)
            .gte('date', startOfYear.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0])

          if (category) {
            transactionQuery = transactionQuery.eq('category', category)
          }

          const { data: transactions, error: txError } = await transactionQuery

          if (txError) {
            console.error('[chat] get_budget_vs_actual: Transaction query error', txError)
            return { error: txError.message }
          }

          const expenseTransactions = (transactions || []).filter((tx) => {
            if (EXCLUDED_CATEGORIES.includes(tx.category || '')) return false
            return (tx.amount_gbp && tx.amount_gbp < 0) || (tx.amount_usd && tx.amount_usd < 0)
          })

          expenseTransactions.forEach((tx) => {
            const cat = tx.category || 'Unknown'
            if (!actualByCategory[cat]) {
              actualByCategory[cat] = { gbp: 0, usd: 0 }
            }

            if (tx.amount_gbp) {
              actualByCategory[cat].gbp += Math.abs(tx.amount_gbp)
            }
            if (tx.amount_usd) {
              actualByCategory[cat].usd += Math.abs(tx.amount_usd)
            }
          })
        }

        const totalDaysInYear = (yearNum: number) => (new Date(yearNum, 1, 29).getMonth() === 1 ? 366 : 365)
        const dayOfYear = Math.floor(
          (Number(today) - Number(new Date(currentYear, 0, 0))) / (24 * 60 * 60 * 1000)
        )
        const pctYearElapsed = Math.min(Math.max(dayOfYear / totalDaysInYear(currentYear), 0), 1)

        const comparisons = budgets.map((budget) => {
          const actual = actualByCategory[budget.category] || { gbp: 0, usd: 0 }
          const annualBudgetAbs = Math.abs(budget.annual_budget_gbp || 0)

          const budgetGBP = period === 'ytd'
            ? annualBudgetAbs * pctYearElapsed
            : annualBudgetAbs
          const budgetUSD = budgetGBP * fxRate

          const varianceGBP = budgetGBP - actual.gbp
          const varianceUSD = budgetUSD - actual.usd

          const percentUsedGBP = budgetGBP > 0 ? (actual.gbp / budgetGBP) * 100 : 0
          const percentUsedUSD = budgetUSD > 0 ? (actual.usd / budgetUSD) * 100 : 0

          return {
            category: budget.category,
            budgetGBP,
            budgetUSD,
            actualGBP: actual.gbp,
            actualUSD: actual.usd,
            varianceGBP,
            varianceUSD,
            percentUsedGBP,
            percentUsedUSD,
            isOverBudget: varianceGBP < 0 || varianceUSD < 0,
          }
        })

        comparisons.sort((a, b) => {
          const aVariance = Math.min(a.varianceGBP, a.varianceUSD)
          const bVariance = Math.min(b.varianceGBP, b.varianceUSD)
          return aVariance - bVariance
        })

        const overBudget = comparisons.filter(c => c.isOverBudget)
        const underBudget = comparisons.filter(c => !c.isOverBudget)

        const expenseComparisons = comparisons.filter(c => !EXCLUDED_CATEGORIES.includes(c.category))
        const totalGapGBP = expenseComparisons.reduce((sum, c) => sum + c.varianceGBP, 0)
        const totalGapUSD = expenseComparisons.reduce((sum, c) => sum + c.varianceUSD, 0)

        const totalBudgetGBP = expenseComparisons.reduce((sum, c) => sum + c.budgetGBP, 0)
        const totalActualGBP = expenseComparisons.reduce((sum, c) => sum + c.actualGBP, 0)

        const summary = period === 'ytd'
          ? `YTD Budget Analysis (actual spending): ${overBudget.length} category${overBudget.length === 1 ? '' : 'ies'} over budget, ${underBudget.length} under budget. Total gap: £${Math.abs(totalGapGBP).toLocaleString('en-GB', { maximumFractionDigits: 0 })} ${totalGapGBP >= 0 ? 'under' : 'over'} budget.`
          : `Annual Budget Analysis (forecasted annual spend vs annual budget): ${overBudget.length} category${overBudget.length === 1 ? '' : 'ies'} over budget, ${underBudget.length} under budget. Total annual spend gap: £${Math.abs(totalGapGBP).toLocaleString('en-GB', { maximumFractionDigits: 0 })} ${totalGapGBP >= 0 ? 'under' : 'over'} budget (forecasted spend: £${totalActualGBP.toLocaleString('en-GB', { maximumFractionDigits: 0 })}, budget: £${totalBudgetGBP.toLocaleString('en-GB', { maximumFractionDigits: 0 })}).`

        return {
          comparison: {
            period,
            year: currentYear,
            comparisons,
            summary: {
              totalCategories: comparisons.length,
              overBudget: overBudget.length,
              underBudget: underBudget.length,
              topOverspend: comparisons.slice(0, 5).filter(c => c.isOverBudget),
              totalGapGBP,
              totalGapUSD,
              totalBudgetGBP,
              totalActualGBP,
            },
          },
          summary,
        }
      } catch (err) {
        console.error('[chat] get_budget_vs_actual: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
