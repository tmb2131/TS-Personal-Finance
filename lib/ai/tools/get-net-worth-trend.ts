import { z } from 'zod'
import type { ToolContext } from './types'
import { fetchCurrentFxRateForTool } from './helpers'

export function createGetNetWorthTrendTool(ctx: ToolContext) {
  return {
    description: `Get net worth over a date range (time series). Use when the user asks how their net worth has changed over time or for a trend over a date range. Use CURRENT DATE CONTEXT for relative dates.`,
    inputSchema: z.object({
      startDate: z.string().describe('Start date (YYYY-MM-DD). Use CURRENT DATE CONTEXT for "last year", "this year", etc.'),
      endDate: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today if omitted.'),
      groupBy: z.enum(['total', 'entity']).optional().default('total').describe('Return total only or breakdown by entity (category in historical_net_worth).'),
    }),
    execute: async ({ startDate, endDate, groupBy = 'total' }: { startDate: string; endDate?: string; groupBy?: 'total' | 'entity' }) => {
      try {
        const end = endDate || ctx.todayISO
        console.log('[chat] get_net_worth_trend: Starting', { startDate, endDate: end, groupBy })

        const { data: rows, error } = await ctx.supabase
          .from('historical_net_worth')
          .select('date, category, amount_gbp, amount_usd')
          .eq('user_id', ctx.userId)
          .gte('date', startDate)
          .lte('date', end)
          .order('date', { ascending: true })

        if (error) {
          console.error('[chat] get_net_worth_trend: Query error', error)
          return { error: error.message }
        }
        if (!rows || rows.length === 0) {
          return {
            trend: null,
            summary: `No net worth data found between ${startDate} and ${end}.`,
          }
        }

        const fxRate = await fetchCurrentFxRateForTool(ctx.supabase)

        const byDate: Record<string, { totalGbp: number; totalUsd: number; byEntity?: Record<string, { gbp: number; usd: number }> }> = {}
        rows.forEach((r: { date: string; category: string; amount_gbp?: number | null; amount_usd?: number | null }) => {
          const gbp = Number(r.amount_gbp ?? 0)
          const usd = Number(r.amount_usd ?? 0)
          if (!byDate[r.date]) {
            byDate[r.date] = { totalGbp: 0, totalUsd: 0, ...(groupBy === 'entity' ? { byEntity: {} } : {}) }
          }
          byDate[r.date].totalGbp += gbp
          byDate[r.date].totalUsd += usd
          if (groupBy === 'entity' && byDate[r.date].byEntity) {
            const ent = r.category || 'Other'
            if (!byDate[r.date].byEntity![ent]) byDate[r.date].byEntity![ent] = { gbp: 0, usd: 0 }
            byDate[r.date].byEntity![ent].gbp += gbp
            byDate[r.date].byEntity![ent].usd += usd
          }
        })

        const sortedDates = Object.keys(byDate).sort()
        const firstDate = sortedDates[0]
        const lastDate = sortedDates[sortedDates.length - 1]
        const startVal = byDate[firstDate]
        const endVal = byDate[lastDate]
        const startGbp = startVal?.totalGbp ?? 0
        const endGbp = endVal?.totalGbp ?? 0
        const startUsd = startVal?.totalUsd ?? 0
        const endUsd = endVal?.totalUsd ?? 0
        const changeGbp = endGbp - startGbp
        const _changeUsd = endUsd - startUsd

        void _changeUsd
        void fxRate

        const summary =
          changeGbp >= 0
            ? `Net worth increased from £${startGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} to £${endGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} GBP between ${firstDate} and ${lastDate} (+£${Math.abs(changeGbp).toLocaleString('en-GB', { maximumFractionDigits: 0 })}).`
            : `Net worth decreased from £${startGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} to £${endGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} GBP between ${firstDate} and ${lastDate} (-£${Math.abs(changeGbp).toLocaleString('en-GB', { maximumFractionDigits: 0 })}).`

        return {
          trend: {
            startDate: firstDate,
            endDate: lastDate,
            startGbp,
            endGbp,
            startUsd,
            endUsd,
            changeGbp,
            changeUsd: _changeUsd,
            series: sortedDates.map((d) => ({
              date: d,
              totalGbp: byDate[d].totalGbp,
              totalUsd: byDate[d].totalUsd,
              ...(groupBy === 'entity' && byDate[d].byEntity ? { byEntity: byDate[d].byEntity } : {}),
            })),
          },
          summary,
        }
      } catch (err) {
        console.error('[chat] get_net_worth_trend: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
