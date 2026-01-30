'use client'

import { Wallet, Receipt, TrendingUp, BarChart3, Activity } from 'lucide-react'
import { cn } from '@/utils/cn'

interface NavigationItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navigationItems: NavigationItem[] = [
  { id: 'cash-runway', label: 'Cash Runway', icon: Wallet },
  { id: 'transaction-analysis', label: 'Transaction Analysis', icon: Receipt },
  { id: 'ytd-spend', label: 'YTD Spend Over Time', icon: TrendingUp },
  { id: 'annual-cumulative', label: 'Annual Cumulative Spend', icon: BarChart3 },
  { id: 'yoy-net-worth', label: 'YoY Net Worth Change', icon: Activity },
]

export function AnalysisNavigation() {
  const scrollToSection = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    const element = document.getElementById(id)
    if (!element) {
      console.error(`Element with id "${id}" not found`)
      return
    }
    
    // Find the scrollable container (main element)
    const mainElement = document.querySelector('main')
    if (!mainElement) {
      // Fallback to window scroll if main not found
      const yOffset = -100
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
      return
    }
    
    // Calculate position relative to the scrollable container
    const headerOffset = 100
    const elementRect = element.getBoundingClientRect()
    const mainRect = mainElement.getBoundingClientRect()
    
    // Position relative to main container
    const relativeTop = elementRect.top - mainRect.top + mainElement.scrollTop
    
    // Scroll the main container
    mainElement.scrollTo({
      top: relativeTop - headerOffset,
      behavior: 'smooth',
    })
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
      {navigationItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={(e) => {
              console.log('Button clicked:', item.id)
              scrollToSection(item.id, e)
            }}
            className={cn(
              'p-4 cursor-pointer transition-all hover:shadow-md hover:scale-105',
              'border-2 border-border rounded-lg bg-card text-card-foreground',
              'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary',
              'flex flex-col items-center gap-2 text-center'
            )}
          >
            <Icon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
