import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LiquidityOverviewKPIs from '@/components/liquidity/liquidity-overview-kpis'
import CommittedCapitalVsCash from '@/components/liquidity/committed-capital-vs-cash'
import MonthlyExpensesVsLiquidity from '@/components/liquidity/monthly-expenses-vs-liquidity'
import DebtOverview from '@/components/liquidity/debt-overview'
import LiquidityDistribution from '@/components/liquidity/liquidity-distribution'
import RiskProfileTable from '@/components/liquidity/risk-profile-table'

export default async function LiquidityPage() {
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
        <h1 className="text-2xl md:text-3xl font-bold">Liquidity Overview</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Track cash position, debt obligations, and asset liquidity
        </p>
      </div>

      <LiquidityOverviewKPIs />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <CommittedCapitalVsCash />
        <MonthlyExpensesVsLiquidity />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <DebtOverview />
        <LiquidityDistribution />
      </div>

      <RiskProfileTable />
    </div>
  )
}
