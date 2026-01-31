import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NetWorthChartWrapper } from '@/components/dashboard/net-worth-chart-wrapper'
import { IncomeVsExpensesChart } from '@/components/dashboard/income-vs-expenses-chart'
import { BudgetTableWrapper } from '@/components/dashboard/budget-table-wrapper'
import { AnnualTrendsTableWrapper } from '@/components/dashboard/annual-trends-table-wrapper'
import { MonthlyTrendsTableWrapper } from '@/components/dashboard/monthly-trends-table-wrapper'
import { DashboardNavigation } from '@/components/dashboard/dashboard-navigation'
import { DashboardAtAGlance } from '@/components/dashboard/dashboard-at-a-glance'
import { DashboardBackToTop } from '@/components/dashboard/dashboard-back-to-top'
import {
  NetWorthChartSkeleton,
  BudgetTableSkeleton,
  TrendsTableSkeleton,
  IncomeVsExpensesChartSkeleton,
} from '@/components/dashboard/skeletons'
import { IncomeVsExpensesChartWrapper } from '@/components/dashboard/income-vs-expenses-chart-wrapper'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-2 md:space-y-3">
      {/* Header - Renders immediately */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Overview of your financial position and trends
        </p>
      </div>

      <DashboardAtAGlance />

      <DashboardNavigation />

      {/* Section 1: Net Worth + Income vs Expenses */}
      <section id="net-worth-chart" className="scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          <Suspense fallback={<NetWorthChartSkeleton />}>
            <NetWorthChartWrapper />
          </Suspense>
          <Suspense fallback={<IncomeVsExpensesChartSkeleton />}>
            <IncomeVsExpensesChartWrapper />
          </Suspense>
        </div>
      </section>

      {/* Section 2: Budget Table */}
      <section id="budget-table" className="scroll-mt-24 pt-3 md:pt-4 border-t border-border">
        <Suspense fallback={<BudgetTableSkeleton />}>
          <BudgetTableWrapper />
        </Suspense>
      </section>

      {/* Section 3: Annual Trends */}
      <section id="annual-trends" className="scroll-mt-24 pt-3 md:pt-4 border-t border-border">
        <Suspense fallback={<TrendsTableSkeleton />}>
          <AnnualTrendsTableWrapper />
        </Suspense>
      </section>

      {/* Section 4: Monthly Trends */}
      <section id="monthly-trends" className="scroll-mt-24 pt-3 md:pt-4 border-t border-border">
        <Suspense fallback={<TrendsTableSkeleton />}>
          <MonthlyTrendsTableWrapper />
        </Suspense>
      </section>

      {/* Footer: repeat nav + back to top */}
      <footer className="pt-3 md:pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
        <DashboardNavigation />
        <DashboardBackToTop />
      </footer>
    </div>
  )
}
