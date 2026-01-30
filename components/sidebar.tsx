'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import { LayoutDashboard, Wallet, TrendingUp, Lightbulb, ChevronLeft, ChevronRight, Repeat, Baby } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navigation = [
  { name: 'Key Insights', href: '/insights', icon: Lightbulb },
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Accounts', href: '/accounts', icon: Wallet },
  { name: 'Kids Accounts', href: '/kids', icon: Baby },
  { name: 'Analysis', href: '/analysis', icon: TrendingUp },
  { name: 'Recurring', href: '/recurring', icon: Repeat },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar-collapsed')
    if (savedState !== null) {
      setCollapsed(savedState === 'true')
    }
  }, [])

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !collapsed
    setCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  return (
    <>
      {/* Desktop Sidebar - Left */}
      <div className={cn(
        'hidden md:flex h-full flex-col border-r bg-background transition-all duration-300',
        collapsed ? 'w-20' : 'w-64'
      )}>
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <h1 className="text-xl font-bold whitespace-nowrap">TS Personal Finance</h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="ml-auto h-8 w-8"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors group',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  collapsed && 'justify-center'
                )}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="whitespace-nowrap">{item.name}</span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Mobile Bottom Navigation - Instagram Style */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border"
        suppressHydrationWarning
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <item.icon className={cn('h-6 w-6 transition-transform', isActive && 'scale-110')} />
                <span className="text-xs font-medium">{item.name}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
