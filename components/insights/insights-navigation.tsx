'use client'

import { LayoutDashboard, Wallet, Target, Calendar, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'

const navButtonClass = cn(
  'p-4 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]',
  'border-2 rounded-lg flex flex-col items-center gap-2 text-center',
  'bg-slate-700 border-slate-600 text-slate-100',
  'hover:bg-slate-600 hover:border-slate-500',
  'focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-background'
)

interface NavigationItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navigationItems: NavigationItem[] = [
  { id: 'executive-summary', label: 'Executive Summary', icon: LayoutDashboard },
  { id: 'net-worth', label: 'Net Worth', icon: Wallet },
  { id: 'annual-budget', label: 'Annual Budget', icon: Target },
  { id: 'annual-spend', label: 'Annual Spend', icon: Calendar },
  { id: 'monthly-spend', label: 'Monthly Spend', icon: TrendingUp },
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

export function InsightsNavigation() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
      {navigationItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={(e) => scrollToSection(item.id, e)}
            className={navButtonClass}
          >
            <Icon className="h-6 w-6 text-slate-200" />
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
