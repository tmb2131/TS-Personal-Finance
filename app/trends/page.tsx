import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ForecastSection } from '@/components/trends/forecast-section'
import { ObservationsSection } from '@/components/observations/observations-section'
import { fetchInsightsData } from '@/lib/insights-data'
import { NetWorthStartEndChart } from '@/components/analysis/net-worth-start-end-chart'
import { YoYNetWorthWaterfall } from '@/components/analysis/yoy-net-worth-waterfall'
import { MonthlyCategoryTrendsSection } from '@/components/analysis/monthly-category-trends-section'
import { AnnualTrendsTableWrapper } from '@/components/dashboard/annual-trends-table-wrapper'
import { MonthlyTrendsTableWrapper } from '@/components/dashboard/monthly-trends-table-wrapper'
import { TrendsTableSkeleton } from '@/components/dashboard/skeletons'
import { ForecastPageWrapper } from '@/components/forecast/forecast-page-wrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionNav } from '@/components/nav/section-nav'
import { HashScroll } from '@/components/nav/hash-scroll'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Trends',
}

const SECTIONS = [
  { id: 'observations', label: 'Observations' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'methodologies', label: 'Methodologies' },
  { id: 'yoy-net-worth', label: 'YoY net worth' },
  { id: 'monthly-category-trends', label: 'Category trends' },
  { id: 'annual-trends', label: 'Annual' },
  { id: 'monthly-trends', label: 'Monthly' },
]

export default async function TrendsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Carried over from the retired Key Insights page: ranked observations are
  // the one piece of that page that was not duplicated elsewhere.
  const insights = await fetchInsightsData(supabase, user.id)

  return (
    <div className="space-y-4 md:space-y-6">
      <HashScroll />
      <PageHeader
        title="Trends"
        description="How the year is tracking, and how it compares with the years before it."
      />

      <SectionNav sections={SECTIONS} />

      <ObservationsSection
        allocation={insights.allocationObservations ?? []}
        spending={insights.spendingObservations ?? []}
      />

      <section id="forecast" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <ForecastSection />
      </section>

      <section id="methodologies" className="scroll-mt-24 border-t pt-4 md:pt-6 space-y-4">
        <h2 className="text-title">Methodologies</h2>
        <p className="text-body text-muted-foreground">
          Three methodologies, same data. The range across all three is the scenario band.
        </p>
        <Suspense fallback={<Skeleton className="h-[360px] w-full" />}>
          <ForecastPageWrapper />
        </Suspense>
      </section>

      <section id="yoy-net-worth" className="scroll-mt-24 border-t pt-4 md:pt-6 space-y-4">
        <h2 className="text-title">Year-over-year net worth</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <NetWorthStartEndChart />
          <YoYNetWorthWaterfall />
        </div>
      </section>

      <section id="monthly-category-trends" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <MonthlyCategoryTrendsSection />
      </section>

      <section id="annual-trends" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <Suspense fallback={<TrendsTableSkeleton />}>
          <AnnualTrendsTableWrapper />
        </Suspense>
      </section>

      <section id="monthly-trends" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <Suspense fallback={<TrendsTableSkeleton />}>
          <MonthlyTrendsTableWrapper />
        </Suspense>
      </section>
    </div>
  )
}
