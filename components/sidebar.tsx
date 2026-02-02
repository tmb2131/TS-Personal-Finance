'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/cn'
import { LayoutDashboard, Wallet, TrendingUp, Lightbulb, ChevronLeft, ChevronRight, Repeat, Baby, MoreHorizontal, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const navigation = [
  { name: 'Key Insights', href: '/insights', icon: Lightbulb },
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Accounts', href: '/accounts', icon: Wallet },
  { name: 'Kids Accounts', href: '/kids', icon: Baby },
  { name: 'Analysis', href: '/analysis', icon: TrendingUp },
  { name: 'Recurring', href: '/recurring', icon: Repeat },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const mobilePrimaryNav = navigation.slice(0, 3)
const mobileMoreNav = navigation.slice(3)

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

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

      {/* Mobile Bottom Navigation - hidden on login page */}
      {pathname !== '/login' && (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        suppressHydrationWarning
      >
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2 px-2 sm:px-3 py-2">
          {mobilePrimaryNav.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl border py-2 px-1.5 min-h-[48px] touch-manipulation transition-[transform,color,background-color,border-color] duration-100 ease-out active:scale-95',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                )}
              >
                <item.icon className={cn('h-5 w-5 flex-shrink-0 transition-transform duration-100', isActive && 'scale-110')} />
                <span className="text-xs font-medium text-center leading-tight">{item.name}</span>
              </Link>
            )
          })}
          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl border py-2 px-1.5 min-h-[48px] touch-manipulation transition-[transform,color,background-color,border-color] duration-100 ease-out active:scale-95',
                  mobileMoreNav.some((item) => pathname === item.href)
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                )}
              >
                <MoreHorizontal className="h-5 w-5 flex-shrink-0" />
                <span className="text-xs font-medium text-center leading-tight">More</span>
              </button>
            </DialogTrigger>
            <DialogContent className="fixed left-0 right-0 bottom-0 top-auto z-50 max-h-[70vh] w-full translate-x-0 translate-y-0 rounded-t-2xl border-b-0 gap-0 p-0 sm:max-w-lg data-[state=open]:slide-in-from-right-96 data-[state=closed]:slide-out-to-right-96 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-top-0">
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle>More</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
                <div className="flex flex-col gap-1">
                  {mobileMoreNav.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-[transform,color,background-color] duration-100 ease-out active:scale-[0.98]',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {item.name}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </nav>
      )}
    </>
  )
}
