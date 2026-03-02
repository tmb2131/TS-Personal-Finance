'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/utils/cn'
import { LayoutDashboard, Wallet, Receipt, TrendingUp, Lightbulb, ChevronLeft, ChevronRight, Repeat, Baby, MoreHorizontal, Settings, Droplets, FileUp, MessageCircle, LogOut, Calendar, LayoutList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
const allNavigation = [
  { name: 'Daily Summary', mobileLabel: 'Summary', href: '/', icon: LayoutList },
  { name: 'Key Insights', mobileLabel: 'Insights', href: '/insights', icon: Lightbulb },
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Today', href: '/today', icon: Calendar },
  { name: 'Accounts', href: '/accounts', icon: Wallet },
  { name: 'Transactions', href: '/transactions', icon: Receipt },
  { name: 'Liquidity', href: '/liquidity', icon: Droplets },
  { name: 'Kids Accounts', href: '/kids', icon: Baby },
  { name: 'Analysis', href: '/analysis', icon: TrendingUp },
  { name: 'Recurring', href: '/recurring', icon: Repeat },
  { name: 'Import', href: '/import', icon: FileUp },
  { name: 'Settings', href: '/settings', icon: Settings },
]

function isRouteActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [hasKidsData, setHasKidsData] = useState(true) // default true to avoid flash

  useEffect(() => {
    const cached = sessionStorage.getItem('findash:hasKidsData')
    if (cached !== null) {
      setHasKidsData(cached === 'true')
      return
    }
    const supabase = createClient()
    supabase
      .from('kids_accounts')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => {
        const has = (count ?? 0) > 0
        setHasKidsData(has)
        sessionStorage.setItem('findash:hasKidsData', String(has))
      })
  }, [])

  const navigation = useMemo(() => {
    return hasKidsData ? allNavigation : allNavigation.filter((item) => item.href !== '/kids')
  }, [hasKidsData])

  const mobilePrimaryNav = useMemo(() => navigation.slice(0, 3), [navigation])
  const mobileMoreNav = useMemo(() => navigation.slice(3), [navigation])

  // Sidebar always defaults to open (not collapsed)
  // Removed localStorage loading so it always starts open when entering the app
  const toggleCollapse = () => {
    setCollapsed(!collapsed)
    // Note: We don't persist the collapsed state to localStorage
    // so the sidebar always opens when entering the app
  }

  const openMobileAssistant = () => {
    setMoreOpen(false)
    window.setTimeout(() => {
      window.dispatchEvent(new Event('findash:open-chat-widget'))
    }, 120)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMoreOpen(false)
    router.replace('/login')
  }

  return (
    <>
      {/* Desktop Sidebar - Left */}
      <div className={cn(
        'hidden h-full flex-col border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:flex transition-all duration-300',
        collapsed ? 'w-20' : 'w-64'
      )}>
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <h1 className="whitespace-nowrap text-lg font-semibold tracking-tight">TS Personal Finance</h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="ml-auto h-9 w-9"
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
            const isActive = isRouteActive(pathname, item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                className={cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-[color,background-color,transform] duration-150',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  collapsed && 'justify-center'
                )}
                aria-current={isActive ? 'page' : undefined}
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
        <div className="border-t px-3 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={cn(
              'h-10 w-full gap-2.5 text-sm',
              collapsed ? 'justify-center px-0' : 'justify-start px-3'
            )}
            aria-label="Log out"
            title={collapsed ? 'Log out' : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Log out</span>}
          </Button>
        </div>
      </div>

      {/* Mobile Bottom Navigation - hidden on login page */}
      {pathname !== '/login' && (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 shadow-[0_-10px_30px_-24px_hsl(var(--foreground)/0.5)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        suppressHydrationWarning
      >
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5 px-2 sm:px-3 py-1">
          {mobilePrimaryNav.map((item) => {
            const isActive = isRouteActive(pathname, item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-xl border py-1 px-1 min-h-[36px] touch-manipulation transition-[transform,color,background-color,border-color] duration-100 ease-out active:scale-95',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className={cn('h-4 w-4 flex-shrink-0 transition-transform duration-100', isActive && 'scale-110')} />
                <span className="text-[10px] font-medium text-center leading-tight">{'mobileLabel' in item ? item.mobileLabel : item.name}</span>
              </Link>
            )
          })}
          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-xl border py-1 px-1 min-h-[36px] touch-manipulation transition-[transform,color,background-color,border-color] duration-100 ease-out active:scale-95',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  mobileMoreNav.some((item) => isRouteActive(pathname, item.href))
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                )}
                aria-label="Open more navigation"
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
              >
                <MoreHorizontal className="h-4 w-4 flex-shrink-0" />
                <span className="text-[10px] font-medium text-center leading-tight">More</span>
              </button>
            </DialogTrigger>
            <DialogContent className="fixed left-0 right-0 bottom-0 top-auto z-[130] max-h-[70vh] w-full translate-x-0 translate-y-0 rounded-t-2xl border-b-0 gap-0 p-0 sm:max-w-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle>More</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={openMobileAssistant}
                    className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-[transform,color,background-color] duration-100 ease-out active:scale-[0.98] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <MessageCircle className="h-5 w-5 flex-shrink-0" />
                    AI Assistant
                  </button>
                  {mobileMoreNav.map((item) => {
                    const isActive = isRouteActive(pathname, item.href)
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        prefetch={true}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-[transform,color,background-color] duration-100 ease-out active:scale-[0.98]',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {item.name}
                      </Link>
                    )
                  })}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-2 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-red-600 transition-[transform,color,background-color] duration-100 ease-out active:scale-[0.98] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-red-400"
                  >
                    <LogOut className="h-5 w-5 flex-shrink-0" />
                    Log out
                  </button>
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
