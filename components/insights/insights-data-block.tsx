import type { InsightsDataPayload } from '@/lib/insights-data'
import { KeyInsights } from './key-insights'
import { ObservationsSection } from './observations-section'

/**
 * Presentational block for Key Insights preloaded payload.
 */
export function InsightsDataBlock({ initialData }: { initialData: InsightsDataPayload }) {
  return (
    <>
      <KeyInsights initialData={initialData} />
      <ObservationsSection
        allocation={initialData.allocationObservations ?? []}
        spending={initialData.spendingObservations ?? []}
      />
    </>
  )
}
