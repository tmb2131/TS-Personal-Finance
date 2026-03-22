import { z } from 'zod'
import type { ToolContext } from './types'
import { getLatestBalancePerAccount } from './helpers'

export function createGetCashRunwayTool(ctx: ToolContext) {
  return {
    description: `Get cash runway: liquid cash (Cash/Checking/Savings accounts) and average monthly burn from the last 3 full calendar months. Use when the user asks about runway, burn, or how long their cash will last.`,
    inputSchema: z.object({}),
    execute: async () => {
      try {
        console.log('[chat] get_cash_runway: Starting')

        const now = new Date()
        const utcYear = now.getUTCFullYear()
        const utcMonth = now.getUTCMonth()
        const startMonth = utcMonth - 3
        const startYear = startMonth < 0 ? utcYear - 1 : utcYear
        const adjustedStartMonth = startMonth < 0 ? startMonth + 12 : startMonth
        const endMonth = utcMonth - 1
        const endYear = endMonth < 0 ? utcYear - 1 : utcYear
        const adjustedEndMonth = endMonth < 0 ? endMonth + 12 : endMonth
        const startDateStr = `${startYear}-${String(adjustedStartMonth + 1).padStart(2, '0')}-01`
        const lastDay = new Date(Date.UTC(endYear, adjustedEndMonth + 1, 0))
        const endDateStr = lastDay.toISOString().split('T')[0]

        const { data: rpcData, error: rpcError } = await ctx.supabase.rpc('get_cash_runway_net_burn', {
          p_start: startDateStr,
          p_end: endDateStr,
        })
        if (rpcError) {
          console.error('[chat] get_cash_runway: RPC error', rpcError)
          return { error: rpcError.message }
        }
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
        const gbpNet = row?.gbp_net != null ? Number(row.gbp_net) : 0
        const usdNet = row?.usd_net != null ? Number(row.usd_net) : 0
        const gbpAvgBurn = Math.max(0, -gbpNet) / 3
        const usdAvgBurn = Math.max(0, -usdNet) / 3

        const CASH_CATEGORIES = ['Cash', 'Checking', 'Savings']
        const { balances: byAccount, error: balErr } = await getLatestBalancePerAccount(ctx.supabase, ctx.userId)
        if (balErr) return { error: balErr }

        let cashGbp = 0
        let cashUsd = 0
        byAccount.forEach(({ balance_total_local, currency, category }) => {
          if (CASH_CATEGORIES.includes(category)) {
            if (currency === 'GBP') cashGbp += balance_total_local
            else cashUsd += balance_total_local
          }
        })

        const gbpMonths = gbpAvgBurn > 0 ? cashGbp / gbpAvgBurn : (cashGbp > 0 ? Number.POSITIVE_INFINITY : 0)
        const usdMonths = usdAvgBurn > 0 ? cashUsd / usdAvgBurn : (cashUsd > 0 ? Number.POSITIVE_INFINITY : 0)

        const summaryParts: string[] = []
        if (cashGbp > 0) {
          const monthsStr = gbpMonths === Infinity ? 'no burn' : `~${Math.round(gbpMonths)} months`
          summaryParts.push(`GBP cash: £${cashGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} (runway ${monthsStr} at £${Math.round(gbpAvgBurn).toLocaleString('en-GB')}/mo burn)`)
        }
        if (cashUsd > 0) {
          const monthsStr = usdMonths === Infinity ? 'no burn' : `~${Math.round(usdMonths)} months`
          summaryParts.push(`USD cash: $${cashUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} (runway ${monthsStr} at $${Math.round(usdAvgBurn).toLocaleString('en-US')}/mo burn)`)
        }
        const summary = summaryParts.length ? summaryParts.join('. ') : 'No cash accounts (Cash/Checking/Savings) found.'

        return {
          runway: {
            gbp: { totalCash: cashGbp, avgMonthlyBurn: gbpAvgBurn, monthsOnHand: gbpMonths === Infinity ? null : gbpMonths },
            usd: { totalCash: cashUsd, avgMonthlyBurn: usdAvgBurn, monthsOnHand: usdMonths === Infinity ? null : usdMonths },
            period: { startDate: startDateStr, endDate: endDateStr },
          },
          summary,
        }
      } catch (err) {
        console.error('[chat] get_cash_runway: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
