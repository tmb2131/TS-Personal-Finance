import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KeyInsights } from '@/components/insights/key-insights'
import { ConnectSheetModal } from '@/components/insights/connect-sheet-modal'
import { DummyDataMessage } from '@/components/insights/dummy-data-message'
import { AutoSyncOnMount } from '@/components/insights/auto-sync-on-mount'
import { DailySummaryOnMount } from '@/components/insights/daily-summary-on-mount'
import { DailySummaryWrapper } from '@/components/insights/daily-summary-wrapper'

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
      <AutoSyncOnMount />
      <DailySummaryOnMount />
      <DailySummaryWrapper />
      <ConnectSheetModal open={needsSpreadsheet} />
      {hasDummyData && <DummyDataMessage />}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Key Insights</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Quick overview of your financial performance and trends
        </p>
      </div>
      <KeyInsights />
    </div>
  )
}
