import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ForecastPageWrapper } from '@/components/forecast/forecast-page-wrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'

export default async function ForecastPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="w-full max-w-7xl mx-auto space-y-3 md:space-y-4 flex flex-col">
      <PageHeader
        title="Forecast"
        description="Three methodologies. Same data. The range across all three is your scenario band."
        accent="emerald"
      />

      <Suspense fallback={<ForecastPageSkeleton />}>
        <ForecastPageWrapper />
      </Suspense>
    </div>
  )
}

function ForecastPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-[360px] w-full" />
      <Skeleton className="h-[480px] w-full" />
    </div>
  )
}
