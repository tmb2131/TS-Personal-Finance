import { createClient } from '@/lib/supabase/server'
import { fetchInsightsData } from '@/lib/insights-data'
import { KeyInsights } from './key-insights'

/**
 * Async server component: fetches insights data and renders the Key Insights block.
 * Used inside Suspense so the insights page shell can render immediately and this
 * streams in when ready (faster perceived load after sign-in).
 */
export async function InsightsDataBlock({ userId }: { userId: string }) {
  const supabase = await createClient()
  const initialData = await fetchInsightsData(supabase, userId)

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
