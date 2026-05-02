import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DummyDataMessage } from '@/components/insights/dummy-data-message'
import { AutoSyncOnMount } from '@/components/insights/auto-sync-on-mount'
import { InsightsHashScroll } from '@/components/insights/insights-hash-scroll'
import { InsightsDataBlock } from '@/components/insights/insights-data-block'
import { InsightsDataHydrator } from '@/components/insights/insights-data-context'
import { DUMMY_SHEET_ID } from '@/lib/ingestion-shared'
import { fetchInsightsData } from '@/lib/insights-data'
import { PageHeader } from '@/components/ui/page-header'

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
      <PageHeader
        title="Key Insights"
        description="Quick overview of your financial performance and trends"
        accent="purple"
      />
      {needsSpreadsheet && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm md:p-5">
          <div className="font-semibold">No live sheet connected</div>
          <p className="mt-1 text-muted-foreground">
            You can still use Findash with CSV imports and manual data entry. Add a spreadsheet only if you want a refreshable Transaction Log source.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/import"
              className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Open CSV Import
            </Link>
            <Link
              href="/settings#google-sheet"
              className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Connect a Google Sheet
            </Link>
          </div>
        </div>
      )}
      {hasDummyData && <DummyDataMessage />}
      <InsightsDataBlock initialData={initialData} />
    </div>
  )
}
