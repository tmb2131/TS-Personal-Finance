'use client'

import { Wallet, Receipt, TrendingUp, BarChart3, Activity, GitCompare, Calendar } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'

const navButtonClass = cn(
  'p-2.5 md:p-3 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]',
  'border-2 rounded-lg flex flex-col items-center gap-1.5 md:gap-2 text-center shrink-0',
  'bg-primary text-primary-foreground border-primary/80',
  'hover:bg-primary/90 hover:border-primary/70',
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
)

interface NavigationItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navigationItems: NavigationItem[] = [
  { id: 'cash-runway', label: 'Cash Runway', icon: Wallet },
  { id: 'transaction-analysis', label: 'Transaction Analysis', icon: Receipt },
  { id: 'forecast-evolution', label: 'Forecast Evolution', icon: GitCompare },
  { id: 'ytd-spend', label: 'YTD Spend Over Time', icon: TrendingUp },
  { id: 'annual-cumulative', label: 'Annual Cumulative Spend', icon: BarChart3 },
  { id: 'yoy-net-worth', label: 'YoY Net Worth Change', icon: Activity },
  { id: 'monthly-category-trends', label: 'Monthly Trends by Category', icon: Calendar },
]

function scrollToSection(id: string, e?: React.MouseEvent) {
  if (e) {
    e.preventDefault()
    e.stopPropagation()
  }
  const element = document.getElementById(id)
  if (!element) return
  const mainElement = document.querySelector('main')
  if (!mainElement) {
    const y = element.getBoundingClientRect().top + window.pageYOffset - 100
    window.scrollTo({ top: y, behavior: 'smooth' })
    return
  }
  const headerOffset = 100
  const elementRect = element.getBoundingClientRect()
  const mainRect = mainElement.getBoundingClientRect()
  const relativeTop = elementRect.top - mainRect.top + mainElement.scrollTop
  mainElement.scrollTo({ top: relativeTop - headerOffset, behavior: 'smooth' })
}

export function AnalysisNavigation() {
  const isMobile = useIsMobile()
  
  return (
    <div className={cn(
      isMobile
        ? 'flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin -mx-1 px-1'
        : 'grid grid-cols-7 gap-2 md:gap-4'
    )}>
      {navigationItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={(e) => scrollToSection(item.id, e)}
            className={cn(
              navButtonClass,
              isMobile && 'min-w-[calc(33.333%-0.5rem)] max-w-[calc(33.333%-0.5rem)] snap-center'
            )}
          >
            <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground/80" />
            <span className="text-xs font-medium leading-tight">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
