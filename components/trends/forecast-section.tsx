'use client'

import { useEffect, useState } from 'react'
import { CumulativeSpendChart } from '@/components/analysis/cumulative-spend-chart'
import { AnnualCumulativeSpendChart } from '@/components/analysis/annual-cumulative-spend-chart'
import { ForecastEvolutionSection } from '@/components/analysis/forecast-evolution-section'
import { cn } from '@/utils/cn'

/**
 * YTD Cumulative, Annual Cumulative, and Forecast Evolution were three separate
 * sections stacked on the Analysis page. They are three renderings of one
 * question — how is the year tracking against plan — so they share a section
 * and a toggle rather than three scroll positions.
 */
const PERIODS = [
  { id: 'evolution', label: 'How it changed', legacyHash: 'forecast-evolution' },
  { id: 'ytd', label: 'Year to date', legacyHash: 'ytd-spend' },
  { id: 'annual', label: 'Full year', legacyHash: 'annual-cumulative' },
] as const

type PeriodId = (typeof PERIODS)[number]['id']

export function ForecastSection() {
  // "How it changed" leads: the other two describe where the year stands,
  // this one explains what moved the forecast, which is the question worth
  // landing on.
  const [period, setPeriod] = useState<PeriodId>('evolution')

  // Old deep links pointed at one of the three former sections. Open the toggle
  // on whichever the reader asked for.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const match = PERIODS.find((option) => option.legacyHash === hash)
    if (match) setPeriod(match.id)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title">Forecast</h2>
        <div role="tablist" aria-label="Forecast period" className="flex flex-wrap gap-1">
          {PERIODS.map((option) => {
            const isActive = option.id === period
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setPeriod(option.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-meta font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isActive
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* The active view carries the retired section's fragment id, so old deep
          links still resolve to something scrollable. Three empty anchor divs
          would not: HashScroll ignores targets under 150px tall, so a
          zero-height anchor selects the right view and then never scrolls. */}
      <div id={PERIODS.find((option) => option.id === period)!.legacyHash} className="scroll-mt-24">
        {period === 'ytd' && <CumulativeSpendChart />}
        {period === 'annual' && <AnnualCumulativeSpendChart />}
        {period === 'evolution' && <ForecastEvolutionSection />}
      </div>
    </div>
  )
}
