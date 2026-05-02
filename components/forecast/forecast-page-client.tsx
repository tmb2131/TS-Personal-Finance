'use client'

import { useState } from 'react'
import { useTransactionForecast } from '@/lib/hooks/queries/use-transaction-forecast'
import type { TransactionForecastResult } from '@/lib/forecast-transaction-based'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import { ForecastSummaryCards } from './forecast-summary-cards'
import { ForecastMonthlyChart } from './forecast-monthly-chart'
import { ForecastCategoryTable } from './forecast-category-table'
import { ForecastCategoryDrilldown } from './forecast-category-drilldown'
import { ForecastBacktestPanel } from './forecast-backtest-panel'
import { ForecastMethodologyNotes } from './forecast-methodology-notes'
import { ForecastTopMovers } from './forecast-top-movers'

export function ForecastPageClient({
  initialData,
}: {
  initialData: TransactionForecastResult | null
}) {
  const { data, error, isLoading } = useTransactionForecast(initialData)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center gap-3 py-4">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load forecast.'}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading forecast…</div>
    )
  }

  const categoriesWithSpend = data.ensemble.categories.filter(
    (c) => c.fullYearBase > 0 || c.ytd > 0,
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <section id="forecast-summary" className="scroll-mt-24">
        <ForecastSummaryCards data={data} />
      </section>

      <section
        id="forecast-top-movers"
        className="scroll-mt-24 pt-3 md:pt-4 border-t border-border"
      >
        <ForecastTopMovers data={data} />
      </section>

      <section
        id="forecast-monthly-chart"
        className="scroll-mt-24 pt-3 md:pt-4 border-t border-border"
      >
        <ForecastMonthlyChart data={data} />
      </section>

      <section
        id="forecast-category-table"
        className="scroll-mt-24 pt-3 md:pt-4 border-t border-border"
      >
        <ForecastCategoryTable
          data={data}
          categories={categoriesWithSpend}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      </section>

      {selectedCategory && (
        <section
          id="forecast-category-drilldown"
          className="scroll-mt-24 pt-3 md:pt-4 border-t border-border"
        >
          <ForecastCategoryDrilldown
            data={data}
            category={selectedCategory}
            onClose={() => setSelectedCategory(null)}
          />
        </section>
      )}

      {data.backtest && (
        <section
          id="forecast-backtest"
          className="scroll-mt-24 pt-3 md:pt-4 border-t border-border"
        >
          <ForecastBacktestPanel backtest={data.backtest} />
        </section>
      )}

      <section
        id="forecast-methodology"
        className="scroll-mt-24 pt-3 md:pt-4 border-t border-border"
      >
        <ForecastMethodologyNotes data={data} />
      </section>
    </div>
  )
}
