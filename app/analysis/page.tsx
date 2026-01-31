import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TransactionAnalysis } from '@/components/analysis/transaction-analysis'
import { NetWorthStartEndChart } from '@/components/analysis/net-worth-start-end-chart'
import { YoYNetWorthWaterfall } from '@/components/analysis/yoy-net-worth-waterfall'
import { CumulativeSpendChart } from '@/components/analysis/cumulative-spend-chart'
import { AnnualCumulativeSpendChart } from '@/components/analysis/annual-cumulative-spend-chart'
import { CashRunwayCards } from '@/components/analysis/cash-runway-cards'
import { AnalysisNavigation } from '@/components/analysis/analysis-navigation'

export default async function AnalysisPage() {
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
        <TransactionAnalysis />
      </div>
      <div id="ytd-spend" className="scroll-mt-24">
        <CumulativeSpendChart />
      </div>
      <div id="annual-cumulative" className="scroll-mt-24">
        <AnnualCumulativeSpendChart />
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
