'use client'

import { Wallet, Target, Calendar, TrendingUp } from 'lucide-react'
import { SectionNavigation, type SectionNavigationItem } from '@/components/ui/section-navigation'

const navigationItems: SectionNavigationItem[] = [
  { id: 'net-worth', label: 'Net Worth', icon: Wallet },
  { id: 'annual-budget', label: 'Annual Budget', labelShort: 'Budget', icon: Target },
  { id: 'annual-spend', label: 'Annual Spend', labelShort: 'Annual', icon: Calendar },
  { id: 'monthly-spend', label: 'Monthly Spend', labelShort: 'Monthly', icon: TrendingUp },
]

export function InsightsNavigation() {
  return (
    <SectionNavigation
      items={navigationItems}
      containerClassName="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4"
    />
  )
}
