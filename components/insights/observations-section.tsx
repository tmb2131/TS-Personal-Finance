'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils/cn'
import { Wallet, TrendingUp } from 'lucide-react'
import type { Observation } from '@/lib/observations'
import { ObservationCard } from './observation-card'

interface ObservationsSectionProps {
  allocation: Observation[]
  spending: Observation[]
}

type Tab = 'allocation' | 'spending'

export function ObservationsSection({ allocation, spending }: ObservationsSectionProps) {
  const [tab, setTab] = useState<Tab>('allocation')
  const items = tab === 'allocation' ? allocation : spending

  return (
    <Card id="observations" className="scroll-mt-24 border-l-[3px] border-l-violet-500">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg md:text-xl">What your data shows</CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Top 5 observations from your own data, ranked by magnitude.
            </p>
          </div>
          <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-xs md:text-sm">
            <button
              type="button"
              onClick={() => setTab('allocation')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors',
                tab === 'allocation'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Wallet className="h-3.5 w-3.5" />
              Allocation
            </button>
            <button
              type="button"
              onClick={() => setTab('spending')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors',
                tab === 'spending'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Spending
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No notable {tab} observations from your data right now.
          </div>
        ) : (
          items.map((o) => <ObservationCard key={o.id} observation={o} />)
        )}
        <p className="text-[11px] text-muted-foreground pt-2 leading-relaxed">
          These are observations from your own data. TS Personal Finance does not provide financial advice.
        </p>
      </CardContent>
    </Card>
  )
}
