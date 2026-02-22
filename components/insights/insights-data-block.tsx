import type { InsightsDataPayload } from '@/lib/insights-data'
import { KeyInsights } from './key-insights'

/**
 * Presentational block for Key Insights heading + preloaded payload.
 */
export function InsightsDataBlock({ initialData }: { initialData: InsightsDataPayload }) {
  return (
    <>
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Key Insights</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Quick overview of your financial performance and trends
        </p>
      </div>
      <KeyInsights initialData={initialData} />
    </>
  )
}
