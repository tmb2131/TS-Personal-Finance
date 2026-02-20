'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TodayTransactions } from './today-transactions'
import { TodaySpendByCategoryChart } from './today-spend-by-category-chart'
import { TodaySpendByMethodologyChart } from './today-spend-by-methodology-chart'
import type { TodayPageData } from '@/lib/today-types'

type TodayPageContentProps = {
  data: TodayPageData | null
}

export function TodayPageContent({ data }: TodayPageContentProps) {
  if (data === null) {
    return (
      <div className="space-y-4 md:space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <TodaySpendByMethodologyChart
        spendByMethodology={data.spendByMethodology}
        headroomByMethodology={data.headroomByMethodology}
        budgetSumByMethodology={data.budgetSumByMethodology}
        impliedForecastChange={data.impliedForecastChange}
      />
      <TodaySpendByCategoryChart spendByCategory={data.spendByCategory} />
      <TodayTransactions transactions={data.transactions} />
    </div>
  )
}
