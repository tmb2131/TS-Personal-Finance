import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectSheetModal } from '@/components/insights/connect-sheet-modal'
import { DummyDataMessage } from '@/components/insights/dummy-data-message'
import { AutoSyncOnMount } from '@/components/insights/auto-sync-on-mount'
import { DailySummaryOnMount } from '@/components/insights/daily-summary-on-mount'
import { InsightsHashScroll } from '@/components/insights/insights-hash-scroll'
import { InsightsContentWithOpenDaily } from '@/components/insights/insights-content-with-open-daily'
import { InsightsDataBlock } from '@/components/insights/insights-data-block'

const DUMMY_SHEET_ID = '1BxVuJ-DViN5nqpLc-8tGXex_pYiPY8dfL8UV5czCrHY'

export default async function InsightsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('google_spreadsheet_id')
    .eq('id', user.id)
    .single()

  const needsSpreadsheet = !profile?.google_spreadsheet_id?.trim()
  const hasDummyData = profile?.google_spreadsheet_id === DUMMY_SHEET_ID

  return (
    <div className="space-y-4 md:space-y-6">
      <InsightsHashScroll />
      <AutoSyncOnMount />
      <DailySummaryOnMount />
      <ConnectSheetModal open={needsSpreadsheet} />
      {hasDummyData && <DummyDataMessage />}
      <InsightsContentWithOpenDaily>
        <Suspense
          fallback={
            <>
              <Skeleton className="h-9 w-48 mb-2" />
              <Skeleton className="h-5 w-80 max-w-full mb-4" />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            </>
          }
        >
          <InsightsDataBlock userId={user.id} />
        </Suspense>
      </InsightsContentWithOpenDaily>
    </div>
  )
}
