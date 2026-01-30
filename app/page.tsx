import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NetWorthChartWrapper } from '@/components/dashboard/net-worth-chart-wrapper'
import { BudgetTableWrapper } from '@/components/dashboard/budget-table-wrapper'
import { AnnualTrendsTableWrapper } from '@/components/dashboard/annual-trends-table-wrapper'
import { MonthlyTrendsTableWrapper } from '@/components/dashboard/monthly-trends-table-wrapper'
import {
  NetWorthChartSkeleton,
  BudgetTableSkeleton,
  TrendsTableSkeleton,
} from '@/components/dashboard/skeletons'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Renders immediately */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Overview of your financial position and trends
        </p>
      </div>

      {/* Section 1: Net Worth Chart - Loads independently */}
      <Suspense fallback={<NetWorthChartSkeleton />}>
        <NetWorthChartWrapper />
      </Suspense>

      {/* Section 2: Budget Table - Loads independently */}
      <Suspense fallback={<BudgetTableSkeleton />}>
        <BudgetTableWrapper />
      </Suspense>

      {/* Section 3: Annual Trends - Loads independently */}
      <Suspense fallback={<TrendsTableSkeleton />}>
        <AnnualTrendsTableWrapper />
      </Suspense>

      {/* Section 4: Monthly Trends - Loads independently */}
      <Suspense fallback={<TrendsTableSkeleton />}>
        <MonthlyTrendsTableWrapper />
      </Suspense>
    </div>
  )
}
