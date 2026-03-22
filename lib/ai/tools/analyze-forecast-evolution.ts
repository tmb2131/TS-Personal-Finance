import { z } from 'zod'
import type { ToolContext } from './types'
import { fetchCurrentFxRateForTool } from './helpers'
import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'

export function createAnalyzeForecastEvolutionTool(ctx: ToolContext) {
  return {
    description: `Analyze how the expenses gap to budget (budget minus tracking) has changed over time. Use when the user asks about changes in the forecast/gap (e.g., 'vs last week'). Uses expense categories only (excludes Income, Gift Money, Other Income, Excluded).
        IMPORTANT SIGN CONVENTION (must match Analysis > Forecast Evolution): for expense gap, negative values are better (under budget), positive values are worse (over budget). Therefore:
        - Negative change in gap (end - start < 0) = Improved
        - Positive change in gap (end - start > 0) = Worsened`,
    inputSchema: z.object({
      startDate: z.string().describe('Start date for comparison (YYYY-MM-DD). Use CURRENT DATE CONTEXT for "last month", "last week", etc.'),
      endDate: z.string().optional().describe('End date for comparison (YYYY-MM-DD). Defaults to today if omitted.'),
      currency: z.enum(['GBP', 'USD']).optional().default('GBP').describe('Currency for summary display. All evolution data is in GBP; summary is converted if USD.'),
    }),
    execute: async ({ startDate, endDate, currency = 'GBP' }: { startDate: string; endDate?: string; currency?: 'GBP' | 'USD' }) => {
      try {
        const end = endDate || ctx.todayISO
        console.log('[chat] analyze_forecast_evolution: Starting', { startDate, endDate: end, currency })

        const EXCLUDED = ['Income', 'Gift Money', 'Other Income', 'Excluded']
        const isExpense = (c: string) => !EXCLUDED.includes(c)

        const snapshots = await computeForecastSnapshotsForDates(ctx.supabase, ctx.userId, [startDate, end])
        const startSnapshot = snapshots.get(startDate) ?? new Map()
        const endSnapshot = snapshots.get(end) ?? new Map()

        const startGapMap = new Map<string, number>()
        for (const [category, values] of startSnapshot.entries()) {
          if (!isExpense(category)) continue
          startGapMap.set(category, values.gap)
        }

        const endGapMap = new Map<string, number>()
        for (const [category, values] of endSnapshot.entries()) {
          if (!isExpense(category)) continue
          endGapMap.set(category, values.gap)
        }

        if (startGapMap.size === 0 && endGapMap.size === 0) {
          return { error: `No forecast evolution data available between ${startDate} and ${end}.` }
        }

        const allCategories = new Set([...startGapMap.keys(), ...endGapMap.keys()])
        const drivers: { category: string; change_gbp: number; impact: 'Improved' | 'Worsened' | 'Neutral' }[] = []
        let totalGapChangeGBP = 0

        for (const category of allCategories) {
          const startGap = startGapMap.get(category) ?? 0
          const endGap = endGapMap.get(category) ?? 0
          const changeGbp = endGap - startGap
          totalGapChangeGBP += changeGbp
          const impact: 'Improved' | 'Worsened' | 'Neutral' =
            changeGbp < 0 ? 'Improved' : changeGbp > 0 ? 'Worsened' : 'Neutral'
          drivers.push({ category, change_gbp: changeGbp, impact })
        }

        drivers.sort((a, b) => Math.abs(b.change_gbp) - Math.abs(a.change_gbp))

        const gapImpactDirection: 'Improved' | 'Worsened' | 'Neutral' =
          totalGapChangeGBP < 0 ? 'Improved' : totalGapChangeGBP > 0 ? 'Worsened' : 'Neutral'

        let summary: string
        const fmtGbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
        if (currency === 'USD') {
          const fxRate = await fetchCurrentFxRateForTool(ctx.supabase)
          const fmtUsd = (n: number) => `$${Math.round(n * fxRate).toLocaleString('en-US')}`
          const direction =
            totalGapChangeGBP < 0 ? 'improved' : totalGapChangeGBP > 0 ? 'worsened' : 'stayed flat'
          const topDrivers = drivers.slice(0, 5)
          const worsenedDrivers = topDrivers
            .filter((d) => d.change_gbp > 0)
            .map((d) => `${d.category} (+${fmtUsd(d.change_gbp)})`)
          const improvedDrivers = topDrivers
            .filter((d) => d.change_gbp < 0)
            .map((d) => `${d.category} (${fmtUsd(d.change_gbp)})`)
          const parts: string[] = []
          if (worsenedDrivers.length) parts.push(`Worsening drivers: ${worsenedDrivers.join(', ')}`)
          if (improvedDrivers.length) parts.push(`Improving drivers: ${improvedDrivers.join(', ')}`)
          summary = `The expenses gap to budget ${direction} by ${fmtUsd(Math.abs(totalGapChangeGBP))} between ${startDate} and ${end}. ${parts.join('. ')}${parts.length ? '.' : ''}`
        } else {
          const direction =
            totalGapChangeGBP < 0 ? 'improved' : totalGapChangeGBP > 0 ? 'worsened' : 'stayed flat'
          const topDrivers = drivers.slice(0, 5)
          const worsenedDrivers = topDrivers
            .filter((d) => d.change_gbp > 0)
            .map((d) => `${d.category} (+${fmtGbp(d.change_gbp)})`)
          const improvedDrivers = topDrivers
            .filter((d) => d.change_gbp < 0)
            .map((d) => `${d.category} (${fmtGbp(d.change_gbp)})`)
          const parts: string[] = []
          if (worsenedDrivers.length) parts.push(`Worsening drivers: ${worsenedDrivers.join(', ')}`)
          if (improvedDrivers.length) parts.push(`Improving drivers: ${improvedDrivers.join(', ')}`)
          summary = `The expenses gap to budget ${direction} by ${fmtGbp(Math.abs(totalGapChangeGBP))} between ${startDate} and ${end}. ${parts.join('. ')}${parts.length ? '.' : ''}`
        }

        return {
          evolution: {
            startDate,
            endDate: end,
            total_gap_change: totalGapChangeGBP,
            gap_impact_direction: gapImpactDirection,
            sign_convention: 'Negative change in gap = Improved; positive change in gap = Worsened',
            drivers,
          },
          summary,
        }
      } catch (err) {
        console.error('[chat] analyze_forecast_evolution: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
