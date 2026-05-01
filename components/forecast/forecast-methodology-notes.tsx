'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TransactionForecastResult } from '@/lib/forecast-transaction-based'

export function ForecastMethodologyNotes({ data }: { data: TransactionForecastResult }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg md:text-xl">How these forecasts work</CardTitle>
      </CardHeader>
      <CardContent>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            Methodology details
          </summary>
          <div className="mt-3 space-y-3 text-sm leading-relaxed">
            <div>
              <div className="font-semibold">M1 — Seasonal Average</div>
              <p className="text-muted-foreground">
                For each category, takes the trailing 3-year median of every calendar month. Each remaining
                month of {data.year} is forecast as that month&apos;s historical median — robust to one-off
                spikes. Stable; captures seasonality (e.g. holidays, annual subscriptions); ignores trend.
              </p>
            </div>
            <div>
              <div className="font-semibold">M2 — Seasonal + Trend</div>
              <p className="text-muted-foreground">
                Computes a seasonal index from the trailing 3 years and a category-specific YoY growth rate
                (geometric mean of YoY ratios, clamped to ±30%). Forecast = projected annual × seasonal
                index. Adds inflation / lifestyle drift on top of the seasonal pattern.
              </p>
            </div>
            <div>
              <div className="font-semibold">M3 — Fixed + Variable</div>
              <p className="text-muted-foreground">
                Detects recurring fixed spend by clustering transactions on counterparty + amount band that
                fired in 6+ of the last 12 months. The fixed amount is carried forward unchanged. Variable
                spend (everything not classified as fixed) is forecast using the trailing-12-month variable
                mean weighted by the seasonal index. Most informative when you have lots of subscriptions
                and bills.
              </p>
            </div>
            <div>
              <div className="font-semibold">Best fit</div>
              <p className="text-muted-foreground">
                Each year, the backtest re-runs M1 / M2 / M3 against the most recently completed year and
                computes a per-category error % (MAPE). Best Fit picks the methodology with the lowest
                backtest error <em>per category</em> — for example M1 for one category, M2 for another, M3
                for a third — and sums those picks across categories. Categories with no prior-year data
                fall back to the methodology with the lowest overall portfolio error.
              </p>
            </div>
            <div>
              <div className="font-semibold">Range across methodologies</div>
              <p className="text-muted-foreground">
                For every month and every category, we take the min / mean / max across the three
                methodologies. The base forecast is the mean; the band between min and max is the
                scenario range. A wide band means the methodologies disagree — typically a sign of high
                variance in that category.
              </p>
            </div>
            <div>
              <div className="font-semibold">Current month handling</div>
              <p className="text-muted-foreground">
                Past completed months are pure actuals. The current month is{' '}
                <span className="font-medium">MTD + remaining-days projection</span>: month-to-date spend
                plus <code>(1 − day/days_in_month) × monthly_estimate</code>, where the monthly estimate
                comes from each methodology&apos;s own model. The full-year forecast = past actuals +
                current-month MTD + current-month remainder + future-month forecasts.
              </p>
            </div>
            <div>
              <div className="font-semibold">Excluded from forecast</div>
              <p className="text-muted-foreground">
                Income, Other Income, Gift Money, and Excluded categories are filtered out. Only expense
                spend is forecast.
              </p>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
