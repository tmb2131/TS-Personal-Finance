'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronDown, ChevronRight, Info, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/utils/cn'
import type { Observation, ObservationSeverity } from '@/lib/observations'

const SEVERITY_TOKENS: Record<
  ObservationSeverity,
  { borderClass: string; iconClass: string; pillClass: string; Icon: typeof Info }
> = {
  info: {
    borderClass: '',
    iconClass: 'text-muted-foreground dark:text-muted-foreground',
    pillClass: 'bg-muted text-muted-foreground dark:text-muted-foreground',
    Icon: Info,
  },
  notable: {
    borderClass: '',
    iconClass: 'text-muted-foreground dark:text-muted-foreground',
    pillClass: 'bg-muted text-muted-foreground dark:text-muted-foreground',
    Icon: TrendingUp,
  },
  attention: {
    borderClass: 'border-l-negative',
    iconClass: 'text-negative',
    pillClass: 'bg-negative-tint text-negative',
    Icon: AlertCircle,
  },
}

function formatMetric(o: Observation): string {
  const v = o.metric.value
  if (o.metric.unit === '%') return `${v.toFixed(0)}%`
  if (o.metric.unit === 'count') return `${Math.round(v)}`
  if (o.metric.unit === 'days') return `${Math.round(v)}d`
  return `${v}`
}

export function ObservationCard({ observation }: { observation: Observation }) {
  const [expanded, setExpanded] = useState(false)
  const tokens = SEVERITY_TOKENS[observation.severity]
  const Icon = tokens.Icon

  return (
    <Card
      id={observation.id}
      className={cn('scroll-mt-24 border-l-[3px]', tokens.borderClass)}
    >
      <CardHeader
        className="cursor-pointer pb-3"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', tokens.iconClass)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm md:text-base font-semibold leading-snug">
                  {observation.title}
                </h3>
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', tokens.pillClass)}>
                  {formatMetric(observation)}
                </span>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 leading-snug">
                {observation.oneLiner}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Underlying numbers
            </div>
            <dl className="space-y-1">
              {observation.evidence.map((row, i) => (
                <div
                  key={`${row.label}-${i}`}
                  className={cn(
                    'flex items-center justify-between gap-3 text-sm',
                    row.subtotal && 'pt-1 mt-1 border-t font-medium'
                  )}
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-mono tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
            {observation.drillIn && (
              <div className="pt-2">
                <Link
                  href={observation.drillIn.href}
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  {observation.drillIn.label}
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground pt-1">
              As of {observation.asOf}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
