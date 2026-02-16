'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

export type KPICardAccentColor = 'blue' | 'emerald' | 'violet'

interface KPICardProps {
  title: string
  value: number
  subtitle?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  icon?: LucideIcon
  accentColor?: KPICardAccentColor
}

const accentClasses: Record<KPICardAccentColor, { border: string; pill: string; icon: string }> = {
  blue: { border: 'border-l-blue-500', pill: 'bg-blue-500/15', icon: 'text-blue-600' },
  emerald: { border: 'border-l-emerald-500', pill: 'bg-emerald-500/15', icon: 'text-emerald-600' },
  violet: { border: 'border-l-violet-500', pill: 'bg-violet-500/15', icon: 'text-violet-600' },
}

export function KPICard({ title, value, subtitle, trend, icon: Icon, accentColor = 'blue' }: KPICardProps) {
  const { currency } = useCurrency()
  const symbol = currency === 'USD' ? '$' : '£'
  const accent = Icon ? accentClasses[accentColor] : null

  const formatValue = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val)
  }

  return (
    <Card className={cn('h-full w-full min-w-0', accent?.border && `border-l-[3px] ${accent.border}`)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          {Icon && accent && (
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', accent.pill)}>
              <Icon className={cn('h-5 w-5', accent.icon)} />
            </div>
          )}
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{formatValue(value)}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && (
          <p className={`text-xs mt-1 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.isPositive ? '+' : ''}{trend.value}%
          </p>
        )}
      </CardContent>
    </Card>
  )
}
