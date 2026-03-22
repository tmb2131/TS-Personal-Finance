import { z } from 'zod'
import type { ToolContext } from './types'
import { fetchCurrentFxRateForTool } from './helpers'
import { computeAnnualForecasts } from '@/lib/forecasting'

export function createGetFinancialHealthSummaryTool(ctx: ToolContext) {
  return {
    description: `Get an overall financial health snapshot in one call: net worth, allocation, budget status (net income under/over), and top spending categories. Use when the user asks for an overall picture of their financial health, a summary of where they stand, or how they're doing (accounts, allocation, budget, spending trends).`,
    inputSchema: z.object({
      asOfDate: z.string().optional().describe('Specific date for snapshot (YYYY-MM-DD). Omit for current.'),
      currency: z.enum(['GBP', 'USD']).optional().default('GBP').describe('Currency for summary display.'),
    }),
    execute: async ({ asOfDate, currency = 'GBP' }: { asOfDate?: string; currency?: 'GBP' | 'USD' }) => {
      try {
        console.log('[chat] get_financial_health_summary: Starting', { asOfDate, currency })

        const isHistorical = asOfDate && asOfDate !== 'null'
        const fxRate = await fetchCurrentFxRateForTool(ctx.supabase)

        let totalGbp = 0
        let totalUsd = 0
        const allocationByCurrency: { currency: string; totalGbp: number; totalUsd: number }[] = []

        let totalGbpInclTrust = 0
        let totalUsdInclTrust = 0

        if (isHistorical) {
          const { data: histRows, error: histErr } = await ctx.supabase
            .from('historical_net_worth')
            .select('amount_gbp, amount_usd, category')
            .eq('user_id', ctx.userId)
            .eq('date', asOfDate)
          if (!histErr && histRows?.length) {
            histRows.forEach((r: { amount_gbp?: number | null; amount_usd?: number | null; category?: string | null }) => {
              const gbp = Number(r.amount_gbp ?? 0)
              const usd = Number(r.amount_usd ?? 0)
              totalGbpInclTrust += gbp
              totalUsdInclTrust += usd
              const isTrust = (r.category || '').toLowerCase().includes('trust')
              if (!isTrust) {
                totalGbp += gbp
                totalUsd += usd
              }
            })
            allocationByCurrency.push({ currency: 'GBP', totalGbp: totalGbpInclTrust, totalUsd: totalGbpInclTrust * fxRate })
            allocationByCurrency.push({ currency: 'USD', totalGbp: totalUsdInclTrust / fxRate, totalUsd: totalUsdInclTrust })
          }
        } else {
          const { data: balances, error: balErr } = await ctx.supabase.from('account_balances').select('*').eq('user_id', ctx.userId).order('date_updated', { ascending: false })
          if (balErr) throw new Error(balErr.message)
          const byAccount = new Map<string, { balance_total_local: number; currency: string; date_updated: string; category: string }>()
          ;(balances || []).forEach((b: { institution: string; account_name: string; date_updated: string; balance_total_local?: number | null; currency?: string | null; category?: string | null }) => {
            const key = `${b.institution}-${b.account_name}`
            const existing = byAccount.get(key)
            if (!existing || new Date(b.date_updated) > new Date(existing.date_updated)) {
              byAccount.set(key, {
                balance_total_local: Number(b.balance_total_local ?? 0),
                currency: (b.currency || 'GBP').toUpperCase(),
                date_updated: b.date_updated,
                category: b.category || '',
              })
            }
          })
          const byCurr: Record<string, { gbp: number; usd: number }> = {}
          byAccount.forEach(({ balance_total_local, currency: curr, category: cat }) => {
            const isTrust = (cat || '').toLowerCase().includes('trust')
            if (!byCurr[curr]) byCurr[curr] = { gbp: 0, usd: 0 }
            if (curr === 'GBP') {
              byCurr[curr].gbp += balance_total_local
              totalGbpInclTrust += balance_total_local
              totalUsdInclTrust += balance_total_local * fxRate
              if (!isTrust) {
                totalGbp += balance_total_local
                totalUsd += balance_total_local * fxRate
              }
            } else {
              byCurr[curr].usd += balance_total_local
              totalUsdInclTrust += balance_total_local
              totalGbpInclTrust += balance_total_local / fxRate
              if (!isTrust) {
                totalUsd += balance_total_local
                totalGbp += balance_total_local / fxRate
              }
            }
          })
          Object.entries(byCurr).forEach(([curr, { gbp, usd }]) => {
            allocationByCurrency.push({ currency: curr, totalGbp: gbp, totalUsd: usd })
          })
        }

        const fmtGbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        const netWorthSummary = currency === 'USD'
          ? `Net worth (excl. Trust): ${fmtUsd(totalUsd)} USD`
          : `Net worth (excl. Trust): ${fmtGbp(totalGbp)} GBP`
        const netWorthIncludingTrust = (totalGbpInclTrust !== totalGbp || totalUsdInclTrust !== totalUsd)
          ? currency === 'USD'
            ? `Incl. Trust: ${fmtUsd(totalUsdInclTrust)} USD`
            : `Incl. Trust: ${fmtGbp(totalGbpInclTrust)} GBP`
          : null
        const allocationSummary = allocationByCurrency.length
          ? allocationByCurrency
              .map((a) =>
                a.currency === 'USD'
                  ? `$${(a.totalUsd || a.totalGbp * fxRate).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD`
                  : `£${(a.totalGbp || a.totalUsd / fxRate).toLocaleString('en-GB', { maximumFractionDigits: 0 })} GBP`
              )
              .join(', ')
          : 'No allocation data'

        const EXCLUDED = ['Excluded', 'Income', 'Gift Money', 'Other Income']
        const [budgetRowsRes, annualForecasts] = await Promise.all([
          ctx.supabase.from('budget_targets').select('category, annual_budget_gbp').eq('user_id', ctx.userId),
          computeAnnualForecasts(ctx.supabase, ctx.userId),
        ])
        const budgetRows = budgetRowsRes.data
        const budgetErr = budgetRowsRes.error
        if (budgetErr) throw new Error(budgetErr.message)

        let incomeBudget = 0
        let incomeTracking = 0
        let expensesBudget = 0
        let expensesTracking = 0
        const expenseCategories: { category: string; trackingGbp: number }[] = []

        ;(budgetRows || []).forEach((row: { category: string; annual_budget_gbp?: number | null }) => {
          const budget = Math.abs(Number(row.annual_budget_gbp ?? 0))
          const tracking = Math.abs(Number(annualForecasts.get(row.category)?.forecast ?? row.annual_budget_gbp ?? 0))
          if (row.category === 'Income' || row.category === 'Gift Money') {
            incomeBudget += budget
            incomeTracking += tracking
          } else if (!EXCLUDED.includes(row.category)) {
            expensesBudget += budget
            expensesTracking += tracking
            expenseCategories.push({ category: row.category, trackingGbp: tracking })
          }
        })

        const netIncomeBudget = incomeBudget - expensesBudget
        const netIncomeTracking = incomeTracking - expensesTracking
        const budgetGap = netIncomeTracking - netIncomeBudget
        const budgetStatus = budgetGap >= 0 ? 'under' : 'over'
        const gapDisplay = currency === 'USD' ? Math.abs(budgetGap) * fxRate : Math.abs(budgetGap)
        const budgetStatusSummary = budgetGap >= 0
          ? `Net income budget: Under by ${currency === 'USD' ? '$' : '£'}${gapDisplay.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
          : `Net income budget: Over by ${currency === 'USD' ? '$' : '£'}${gapDisplay.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

        expenseCategories.sort((a, b) => b.trackingGbp - a.trackingGbp)
        const topSpend = expenseCategories.slice(0, 5)
        const topSpendCategories = topSpend.length
          ? `Top spending categories (Estimated Full Year): ${topSpend.map((s) => `${s.category} (£${s.trackingGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })})`).join(', ')}`
          : 'No expense categories'

        const summary = netWorthIncludingTrust
          ? `${netWorthSummary}. ${netWorthIncludingTrust}. ${budgetStatusSummary}. ${topSpendCategories}.`
          : `${netWorthSummary}. ${budgetStatusSummary}. ${topSpendCategories}.`

        return {
          health: {
            netWorthSummary,
            netWorthIncludingTrust,
            allocationSummary,
            budgetStatusSummary,
            topSpendCategories,
            netWorthGbp: totalGbp,
            netWorthUsd: totalUsd,
            netWorthGbpInclTrust: totalGbpInclTrust,
            netWorthUsdInclTrust: totalUsdInclTrust,
            budgetGapGbp: budgetGap,
            budgetStatus,
            topCategories: topSpend.map((s) => ({ category: s.category, trackingGbp: s.trackingGbp })),
          },
          summary,
        }
      } catch (err) {
        console.error('[chat] get_financial_health_summary: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
