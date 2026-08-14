import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountsOverview } from '@/components/accounts/accounts-overview'
import { AddAccountDialog } from '@/components/accounts/add-account-dialog'
import { ImportAccountsButton } from '@/components/accounts/import-accounts-button'
import { NetWorthChartWrapper } from '@/components/dashboard/net-worth-chart-wrapper'
import { NetWorthChartSkeleton } from '@/components/dashboard/skeletons'
import { CashRunwayCards } from '@/components/analysis/cash-runway-cards'
import { EnoughCalculator } from '@/components/liquidity/enough-calculator'
import LiquidityOverviewKPIs from '@/components/liquidity/liquidity-overview-kpis'
import CommittedCapitalVsCash from '@/components/liquidity/committed-capital-vs-cash'
import MonthlyExpensesVsLiquidity from '@/components/liquidity/monthly-expenses-vs-liquidity'
import DebtOverview from '@/components/liquidity/debt-overview'
import LiquidityDistribution from '@/components/liquidity/liquidity-distribution'
import RiskProfileTable from '@/components/liquidity/risk-profile-table'
import HorizonProfileTable from '@/components/liquidity/horizon-profile-table'
import { AddDebtDialog } from '@/components/liquidity/add-debt-dialog'
import { SpendExplorer } from '@/components/sustainable-spend/spend-explorer'
import { KidsSection } from '@/components/kids/kids-section'
import { SectionNav } from '@/components/nav/section-nav'
import { HashScroll } from '@/components/nav/hash-scroll'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Position',
}

const SECTIONS = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'net-worth-chart', label: 'Net worth' },
  { id: 'cash-runway', label: 'Runway' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'sustainable-spend', label: 'Sustainable spend' },
  { id: 'kids', label: 'Kids' },
]

export default async function PositionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <HashScroll />
      <PageHeader
        title="Position"
        description="Accounts, net worth, liquidity, and what is actually spendable."
        actions={
          <div className="flex items-center gap-2">
            <ImportAccountsButton />
            <AddAccountDialog
              triggerLabel="Add account"
              triggerVariant="default"
              triggerSize="default"
            />
          </div>
        }
      />

      <SectionNav sections={SECTIONS} />

      <section id="accounts" className="scroll-mt-24">
        <AccountsOverview />
      </section>

      <section id="net-worth-chart" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <Suspense fallback={<NetWorthChartSkeleton />}>
          <NetWorthChartWrapper />
        </Suspense>
      </section>

      <section id="cash-runway" className="scroll-mt-24 border-t pt-4 md:pt-6">
        <CashRunwayCards />
      </section>

      <section id="liquidity" className="scroll-mt-24 border-t pt-4 md:pt-6 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-title">Liquidity</h2>
          <AddDebtDialog />
        </div>
        <EnoughCalculator />
        <LiquidityOverviewKPIs />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <CommittedCapitalVsCash />
          <MonthlyExpensesVsLiquidity />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <DebtOverview />
          <LiquidityDistribution />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <RiskProfileTable />
          <HorizonProfileTable />
        </div>
      </section>

      <section id="sustainable-spend" className="scroll-mt-24 border-t pt-4 md:pt-6 space-y-4">
        <h2 className="text-title">Sustainable spend</h2>
        <SpendExplorer />
      </section>

      {/* Renders nothing when there are no kids accounts, preserving the
          hide-when-empty behaviour the retired /kids nav item had. */}
      <KidsSection />
    </div>
  )
}
