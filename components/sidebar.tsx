'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  Receipt,
  Settings,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

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
      {/* Desktop sidebar. Sits on the sunken plane so the canvas beside it reads
          as the page — navigation is furniture, not content. */}
      <div
        className={cn(
          'hidden h-full shrink-0 flex-col border-r border-border bg-sunken md:flex',
          'transition-[width] duration-200 ease-out',
          collapsed ? 'w-[4.5rem]' : 'w-60',
        )}
      >
        {/* Brand and the collapse control share the top row. The obvious home
            for "collapse" is the foot of the rail, but the AI assistant's
            floating button is anchored there and sits on top of it. */}
        <div
          className={cn(
            'group/brand flex h-16 shrink-0 items-center gap-2.5 px-3',
            collapsed && 'justify-center px-0',
          )}
        >
          {/* Monogram. A wordmark alone left the top-left corner as the only
              part of the app with no visual identity at all. */}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-hidden
          >
            <span className="editorial text-[0.95rem] leading-none">TS</span>
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-body font-semibold tracking-tight">
                Personal Finance
              </span>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring group-hover/brand:opacity-100"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-[1.15rem] w-[1.15rem]" />
              </button>
            </>
          )}
        </div>

        {collapsed && (
          <div className="flex shrink-0 justify-center pb-1">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-[1.15rem] w-[1.15rem]" />
            </button>
          </div>
        )}

        <nav className={cn('flex-1 space-y-0.5 overflow-y-auto px-2 py-2')} aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = isRouteActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={cn(
                  'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-body font-medium transition-colors duration-150',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isActive
                    ? 'bg-raised text-foreground shadow-card'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  collapsed && 'justify-center px-0',
                )}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.name : undefined}
              >
                <item.icon
                  className={cn(
                    'h-[1.15rem] w-[1.15rem] shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            )
          })}
        </nav>

        {/* The foot of the rail is left clear: the assistant's floating button
            is anchored over this corner. */}
        <div className="h-16 shrink-0" aria-hidden />
      </div>

      {/* Mobile bottom navigation — all five destinations, no "More" sheet */}
      {pathname !== '/login' && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:hidden"
          style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }}
          suppressHydrationWarning
          aria-label="Main"
        >
          <div className="grid grid-cols-5 gap-1 px-2 pt-1">
            {NAV_ITEMS.map((item) => {
              const isActive = isRouteActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={cn(
                    'relative flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 touch-manipulation transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
                  <span
                    className={cn(
                      'text-center text-[0.6875rem] leading-tight',
                      isActive ? 'font-semibold' : 'font-medium',
                    )}
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
