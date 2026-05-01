import { z } from 'zod'
import type { ToolContext } from './types'
import { fetchInsightsData } from '@/lib/insights-data'

export function createSurfaceObservationsTool(ctx: ToolContext) {
  return {
    description: `Surface the top observations from the user's own financial data — both account allocation patterns (concentration, FX exposure, cash share, stale balances) and spending patterns (YoY spikes, monthly outliers, forecast vs budget). These are descriptive observations of the user's data, NOT financial advice or recommendations. When summarizing, paraphrase the facts; do not add prescriptive language ("you should move X", "consider switching", etc.). Use this when the user asks "what should I focus on?", "what stands out?", "what's notable about my finances?", or similar.`,
    inputSchema: z.object({
      kind: z
        .enum(['allocation', 'spending', 'both'])
        .optional()
        .default('both')
        .describe('Which pool of observations to surface.'),
      max: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe('Maximum observations per pool (default 5).'),
    }),
    execute: async ({
      kind = 'both',
      max = 5,
    }: {
      kind?: 'allocation' | 'spending' | 'both'
      max?: number
    }) => {
      try {
        const payload = await fetchInsightsData(ctx.supabase, ctx.userId)

        const project = (
          obs: typeof payload.allocationObservations
        ) =>
          obs.slice(0, max).map((o) => ({
            id: o.id,
            kind: o.kind,
            severity: o.severity,
            title: o.title,
            oneLiner: o.oneLiner,
            metric: o.metric,
            evidence: o.evidence,
            asOf: o.asOf,
            drillIn: o.drillIn,
          }))

        const result: {
          allocation?: ReturnType<typeof project>
          spending?: ReturnType<typeof project>
          summary: string
          asOf: string
        } = {
          asOf: ctx.todayISO,
          summary: '',
        }

        if (kind === 'allocation' || kind === 'both') {
          result.allocation = project(payload.allocationObservations ?? [])
        }
        if (kind === 'spending' || kind === 'both') {
          result.spending = project(payload.spendingObservations ?? [])
        }

        const allocCount = result.allocation?.length ?? 0
        const spendCount = result.spending?.length ?? 0
        result.summary = `Surfaced ${allocCount} allocation observation${allocCount === 1 ? '' : 's'} and ${spendCount} spending observation${spendCount === 1 ? '' : 's'} from the user's data. Paraphrase descriptively; do not add prescriptive recommendations.`

        return result
      } catch (err) {
        console.error('[chat] surface_observations: Execution error', err)
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    },
  }
}
