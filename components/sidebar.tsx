'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Receipt,
  Settings,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type NavItem = {
  name: string
  href: string
  icon: LucideIcon
}

/**
 * Five destinations, flat. Five items do not need grouping headers, and with
 * five the mobile bar has room for all of them — so there is no "More" sheet
 * and every destination is one tap.
 */
const NAV_ITEMS: NavItem[] = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Spending', href: '/spending', icon: Receipt },
  { name: 'Position', href: '/position', icon: Wallet },
  { name: 'Trends', href: '/trends', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
]

function isRouteActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className={cn(
          'hidden h-full flex-col border-r bg-background md:flex transition-[width] duration-200',
          collapsed ? 'w-20' : 'w-60',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && <span className="whitespace-nowrap text-title">TS Personal Finance</span>}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto h-9 w-9"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = isRouteActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  collapsed && 'justify-center',
                )}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">{item.name}</span>}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Mobile bottom navigation — all five destinations, no "More" sheet */}
      {pathname !== '/login' && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
          suppressHydrationWarning
          aria-label="Main"
        >
          <div className="grid grid-cols-5 gap-1 px-2 py-1">
            {NAV_ITEMS.map((item) => {
              const isActive = isRouteActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={cn(
                    'flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 touch-manipulation transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span
                    className={cn('text-center text-meta leading-tight', isActive && 'font-semibold')}
                  >
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
