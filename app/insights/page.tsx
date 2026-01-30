import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KeyInsights } from '@/components/insights/key-insights'
import { InsightsNavigation } from '@/components/insights/insights-navigation'

export default async function InsightsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Key Insights</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Quick overview of your financial performance and trends
        </p>
      </div>
      <InsightsNavigation />
      <KeyInsights />
    </div>
  )
}
