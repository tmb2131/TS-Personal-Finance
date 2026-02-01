import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TransactionAnalysis } from '@/components/analysis/transaction-analysis'
import { NetWorthStartEndChart } from '@/components/analysis/net-worth-start-end-chart'
import { YoYNetWorthWaterfall } from '@/components/analysis/yoy-net-worth-waterfall'
import { CumulativeSpendChart } from '@/components/analysis/cumulative-spend-chart'
import { AnnualCumulativeSpendChart } from '@/components/analysis/annual-cumulative-spend-chart'
import { CashRunwayCards } from '@/components/analysis/cash-runway-cards'
import { AnalysisNavigation } from '@/components/analysis/analysis-navigation'
import { ForecastEvolutionSection } from '@/components/analysis/forecast-evolution-section'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const params = await searchParams
  const section = typeof params?.section === 'string' ? params.section : undefined
  const period = typeof params?.period === 'string' ? params.period : undefined
  const yearParam = typeof params?.year === 'string' ? params.year : undefined
  const monthParam = typeof params?.month === 'string' ? params.month : undefined
  const category = typeof params?.category === 'string' ? params.category : undefined

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Analysis & Trends</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Deep dive into spending patterns and year-over-year changes
        </p>
      </div>
      <AnalysisNavigation />
      <div id="cash-runway" className="scroll-mt-24">
        <CashRunwayCards />
      </div>
      <div id="transaction-analysis" className="scroll-mt-24">
        <TransactionAnalysis
          initialSection={section === 'transaction-analysis' ? section : undefined}
          initialPeriod={period === 'YTD' || period === 'MTD' ? period : undefined}
          initialYear={yearParam ? parseInt(yearParam, 10) : undefined}
          initialMonth={monthParam ? parseInt(monthParam, 10) : undefined}
          initialCategory={category || undefined}
        />
      </div>
      <div id="forecast-evolution" className="scroll-mt-24">
        <ForecastEvolutionSection />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div id="ytd-spend" className="scroll-mt-24 min-w-0">
          <CumulativeSpendChart />
        </div>
        <div id="annual-cumulative" className="scroll-mt-24 min-w-0">
          <AnnualCumulativeSpendChart />
        </div>
      </div>
      <div id="yoy-net-worth" className="scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <NetWorthStartEndChart />
          <YoYNetWorthWaterfall />
        </div>
      </div>
    </div>
  )
}
