import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConnectSheetModal } from '@/components/insights/connect-sheet-modal'
import { DummyDataMessage } from '@/components/insights/dummy-data-message'
import { AutoSyncOnMount } from '@/components/insights/auto-sync-on-mount'
import { InsightsHashScroll } from '@/components/insights/insights-hash-scroll'
import { InsightsDataBlock } from '@/components/insights/insights-data-block'
import { InsightsDataHydrator } from '@/components/insights/insights-data-context'
import { fetchInsightsData } from '@/lib/insights-data'

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
  const initialData = await fetchInsightsData(supabase, user.id)

  return (
    <div className="space-y-4 md:space-y-6">
      <InsightsDataHydrator data={initialData} />
      <InsightsHashScroll />
      <AutoSyncOnMount />
      <ConnectSheetModal open={needsSpreadsheet} />
      {hasDummyData && <DummyDataMessage />}
      <InsightsDataBlock initialData={initialData} />
    </div>
  )
}
