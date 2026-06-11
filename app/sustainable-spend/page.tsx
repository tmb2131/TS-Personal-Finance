import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { SpendExplorer } from '@/components/sustainable-spend/spend-explorer'

export default async function SustainableSpendPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Sustainable Spend"
        description="Explore how your assumptions drive the spending range — adjust them and watch the floor and ceiling move live"
        accent="indigo"
      />
      <SpendExplorer />
    </div>
  )
}
