'use client'

import { CurrencyToggle } from './currency-toggle'
import { DataStatus } from './data-status'
import { Button } from './ui/button'
import { RefreshCw, Plus } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useSync } from '@/lib/contexts/sync-context'
import { cn } from '@/utils/cn'
import type { HeaderStatus } from '@/lib/data/cached-queries'

// Re-export for consumers that imported from header
export { SYNC_COMPLETED_EVENT } from '@/lib/contexts/sync-context'

const SCROLL_THRESHOLD = 8
const BOTTOM_BOUNDARY_PX = 100
// Only hide header when this far (or more) from bottom; avoids flicker when reaching bottom
const HIDE_MIN_DISTANCE_FROM_BOTTOM_PX = 180

export function Header({ initialData: _initialData }: { initialData?: HeaderStatus | null }) {
  const isMobile = useIsMobile()
  const { syncing, handleSync, ingestionStatus } = useSync()
  const [mounted, setMounted] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const lastScrollTop = useRef(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Hide header on scroll down, show on scroll up (mobile only). Disable toggle near bottom to prevent rubber-band flicker.
  useEffect(() => {
    const el = document.querySelector('.main-content') as HTMLElement | null
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      setScrolled(scrollTop > 8)
      if (isMobile) {
        if (distanceFromBottom < BOTTOM_BOUNDARY_PX) {
          setHeaderVisible(true)
          lastScrollTop.current = scrollTop
          return
        }
        if (scrollTop <= 0) {
          setHeaderVisible(true)
        } else if (scrollTop > lastScrollTop.current && scrollTop > SCROLL_THRESHOLD) {
          if (distanceFromBottom >= HIDE_MIN_DISTANCE_FROM_BOTTOM_PX) {
            setHeaderVisible(false)
          }
        } else if (scrollTop < lastScrollTop.current) {
          setHeaderVisible(true)
        }
        lastScrollTop.current = scrollTop
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile])

  return (
    <header
      className={cn(
        'z-40 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/85 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-6 md:pt-0 transition-[transform,box-shadow] duration-200 ease-out',
        isMobile && !headerVisible && '-translate-y-full -mt-16',
        scrolled && headerVisible && 'shadow-card'
      )}
    >
      {/* Left: is the data current, and can I make it current. Everything else
          that used to live here is now behind the status pill. */}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing || (!!ingestionStatus && !ingestionStatus.sheetConnected)}
          className="gap-1.5 px-2.5 md:px-3"
          title={
            ingestionStatus && !ingestionStatus.sheetConnected
              ? 'Connect a Google Sheet source in Settings to enable refresh.'
              : undefined
          }
        >
          <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
          <span className="hidden md:inline">Refresh</span>
        </Button>

        {mounted && <DataStatus />}
      </div>

      {/* Right: currency chip and quick add. Theme and log out moved to
          Settings — neither is frequent enough to hold permanent chrome. */}
      <div className="flex shrink-0 items-center gap-2">
        <CurrencyToggle />
        <Button
          type="button"
          size="sm"
          onClick={() => window.dispatchEvent(new Event('findash:open-quick-add'))}
          className="min-h-[44px] gap-1.5 px-3 md:min-h-0"
          title="Quick add"
          aria-label="Quick add"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden lg:inline">Quick add</span>
        </Button>
      </div>
    </header>
  )
}
