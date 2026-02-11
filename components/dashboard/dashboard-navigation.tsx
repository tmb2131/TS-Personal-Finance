'use client'

import { LineChart, Table, Calendar, CalendarDays } from 'lucide-react'
import { SectionNavigation, type SectionNavigationItem } from '@/components/ui/section-navigation'

const navigationItems: SectionNavigationItem[] = [
  { id: 'net-worth-chart', label: 'Net Worth Chart', icon: LineChart, labelShort: 'Net Worth' },
  { id: 'budget-table', label: 'Budget Table', icon: Table, labelShort: 'Budget' },
  { id: 'annual-trends', label: 'Annual Trends', icon: Calendar, labelShort: 'Annual' },
  { id: 'monthly-trends', label: 'Monthly Trends', icon: CalendarDays, labelShort: 'Monthly' },
]

export function DashboardNavigation() {
  return (
    <SectionNavigation
      items={navigationItems}
      containerClassName="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
    />
  )
}
