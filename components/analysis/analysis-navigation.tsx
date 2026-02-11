'use client'

import { Wallet, Receipt, TrendingUp, BarChart3, Activity, GitCompare, Calendar } from 'lucide-react'
import { SectionNavigation, type SectionNavigationItem } from '@/components/ui/section-navigation'

const navigationItems: SectionNavigationItem[] = [
  { id: 'cash-runway', label: 'Cash Runway', labelShort: 'Runway', icon: Wallet },
  { id: 'transaction-analysis', label: 'Transaction Analysis', labelShort: 'Transactions', icon: Receipt },
  { id: 'forecast-evolution', label: 'Forecast Evolution', labelShort: 'Forecast', icon: GitCompare },
  { id: 'ytd-spend', label: 'YTD Spend Over Time', labelShort: 'YTD Spend', icon: TrendingUp },
  { id: 'annual-cumulative', label: 'Annual Cumulative Spend', labelShort: 'Cumulative', icon: BarChart3 },
  { id: 'yoy-net-worth', label: 'YoY Net Worth Change', labelShort: 'YoY Net Worth', icon: Activity },
  { id: 'monthly-category-trends', label: 'Trends by Category', labelShort: 'Category Trends', icon: Calendar },
]

export function AnalysisNavigation() {
  return (
    <SectionNavigation
      items={navigationItems}
      compact
      mobileScrollable
      containerClassName="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 scrollbar-thin -mx-1 px-1 md:grid md:grid-cols-7 md:gap-2"
    />
  )
}
